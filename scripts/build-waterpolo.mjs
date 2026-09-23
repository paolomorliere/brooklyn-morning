// Builds public/data/waterpolo.json: completed 2026 NCAA men's water polo games involving a watched team.
//
//   node scripts/build-waterpolo.mjs                 fetch all 13 schools, reconcile, write
//   node scripts/build-waterpolo.mjs --dry-run       do everything except write
//   node scripts/build-waterpolo.mjs --school=liu    one school (still merges into the archive)
//   node scripts/build-waterpolo.mjs --no-conditional  ignore stored ETags and refetch everything
//
// Rules this file exists to keep:
//   * each school is fetched and parsed in isolation, so one failure cannot stop the others;
//   * a source that fails is reported as failed and keeps its previous games — never deleted,
//     never silently shown as freshly checked;
//   * the merged feed is validated before it replaces the old one, and written via a temp file
//     so an interrupted run cannot leave half a file behind.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { SCHOOLS, SEASON, SPORT_LABEL, displayName, teamSlug } from './waterpolo.config.mjs';
import { parseSchedule } from './lib/polo-parse.mjs';
import { validateFeed, validateSource } from './lib/polo-validate.mjs';
import { buildTeams, fromFeedGames, involvesWatched, mergeGames, toCandidates, toFeedGames } from './lib/polo-merge.mjs';

const FEED_PATH = 'public/data/waterpolo.json';
const ETAG_PATH = 'state/waterpolo-etags.json';
const LOGO_PATH = 'state/waterpolo-logos.json';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_CONDITIONAL = args.includes('--no-conditional');
const ONLY = (args.find((a) => a.startsWith('--school=')) ?? '').split('=')[1] || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJSON(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Write through a temp file so a killed process cannot leave a truncated feed on disk. */
async function writeAtomic(path, body) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, path);
}

/**
 * One school's page. Conditional when we have a validator for it, so an unchanged page costs a 304.
 * Retries are bounded and backed off; a 304 is a successful check, not a failure.
 */
async function fetchSchedule(cfg, validators, attempt = 0) {
  const headers = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' };
  const v = validators[cfg.id];
  if (v && !NO_CONDITIONAL) {
    if (v.etag) headers['if-none-match'] = v.etag;
    if (v.lastModified) headers['if-modified-since'] = v.lastModified;
  }
  try {
    const r = await fetch(cfg.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status === 304) return { status: 304, html: null, etag: v?.etag ?? null, lastModified: v?.lastModified ?? null };
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return {
      status: r.status,
      html: await r.text(),
      etag: r.headers.get('etag'),
      lastModified: r.headers.get('last-modified'),
    };
  } catch (e) {
    if (attempt < ATTEMPTS - 1) {
      await sleep(1200 * (attempt + 1));
      return fetchSchedule(cfg, validators, attempt + 1);
    }
    throw e;
  }
}

/** Run `work` over `items` with a fixed number of workers. */
async function pooled(items, limit, work) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const startedAt = new Date().toISOString();
  const schools = ONLY ? SCHOOLS.filter((s) => s.id === ONLY) : SCHOOLS;
  if (schools.length === 0) {
    console.error(`No school with id "${ONLY}". Known: ${SCHOOLS.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  await mkdir('state', { recursive: true });
  await mkdir('public/data', { recursive: true });

  const previous = await readJSON(FEED_PATH, null);
  const archive = previous?.games ? fromFeedGames(previous.games) : [];
  const validators = await readJSON(ETAG_PATH, {});
  const logoUrls = new Map(Object.entries(await readJSON(LOGO_PATH, {})));
  const names = new Map();

  // --- 1. fetch, validate and parse each school in isolation -------------------------------------
  const results = await pooled(schools, CONCURRENCY, async (cfg) => {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetchSchedule(cfg, validators);
      if (res.status === 304) {
        return { cfg, ok: true, unchanged: true, checkedAt, rows: [], found: 0, note: 'not modified since last check' };
      }
      const rows = parseSchedule(res.html, { url: cfg.url, generation: cfg.generation, seasonYear: SEASON });
      const verdict = validateSource(res.html, rows, cfg, SEASON);
      if (!verdict.ok) {
        return { cfg, ok: false, checkedAt, rows: [], found: 0, error: `validation failed: ${verdict.why}` };
      }
      return {
        cfg,
        ok: true,
        checkedAt,
        rows,
        found: rows.length,
        note: verdict.how,
        etag: res.etag,
        lastModified: res.lastModified,
      };
    } catch (e) {
      return { cfg, ok: false, checkedAt, rows: [], found: 0, error: (e && e.message) || String(e) };
    }
  });

  // --- 2. reconcile -----------------------------------------------------------------------------
  const candidates = [];
  for (const r of results) {
    if (!r.ok || r.rows.length === 0) continue;
    for (const row of r.rows) {
      names.set(teamSlug(row.opponentRaw), row.opponentRaw);
      if (row.opponentLogo && !logoUrls.has(teamSlug(row.opponentRaw))) {
        logoUrls.set(teamSlug(row.opponentRaw), row.opponentLogo);
      }
    }
    candidates.push(...toCandidates(r.rows, r.cfg, r.checkedAt, SEASON));
  }
  // Deterministic order in, deterministic feed out.
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.source.id.localeCompare(b.source.id) || a.slot - b.slot);

  const { games, stats } = mergeGames(archive, candidates);
  const all = toFeedGames(games);
  const kept = all.filter(involvesWatched);
  const dropped = all.length - kept.length;

  // --- 3. assemble and validate the whole feed ---------------------------------------------------
  const logos = new Map();
  for (const slug of new Set(kept.flatMap((g) => [g.home.team, g.away.team]))) {
    if (logoUrls.has(slug)) logos.set(slug, `logos/${slug}.webp`);
  }
  for (const s of SCHOOLS) names.set(s.id, s.display);

  const feed = {
    schemaVersion: 1,
    season: SEASON,
    sport: SPORT_LABEL,
    builtAt: new Date().toISOString(),
    sources: results.map((r) => ({
      id: r.cfg.id,
      school: r.cfg.school,
      display: r.cfg.display,
      url: r.cfg.url,
      ok: r.ok,
      checkedAt: r.checkedAt,
      found: r.found,
      error: r.ok ? null : r.error,
      note: r.note ?? null,
    })),
    teams: buildTeams(kept, names, logos),
    games: kept,
  };

  // A source we did not fetch this run (--school=) keeps whatever the last run recorded for it.
  if (ONLY && previous?.sources) {
    const fresh = new Set(feed.sources.map((s) => s.id));
    feed.sources = [...previous.sources.filter((s) => !fresh.has(s.id)), ...feed.sources].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  } else {
    feed.sources.sort((a, b) => a.id.localeCompare(b.id));
  }

  const problems = validateFeed(feed);
  const okCount = feed.sources.filter((s) => s.ok).length;

  // --- 4. report --------------------------------------------------------------------------------
  const dates = kept.map((g) => g.date).sort();
  console.log(
    `${SPORT_LABEL} ${SEASON}: ${kept.length} games, ${dates[0] ?? '—'} … ${dates[dates.length - 1] ?? '—'}`,
  );
  console.log(
    `sources ${okCount}/${feed.sources.length} ok · added ${stats.added} · corrected ${stats.corrected} · conflicts ${stats.conflicts} (${stats.resolved} settled by an official recap)` +
      (dropped ? ` · dropped ${dropped} with no watched team` : ''),
  );
  for (const s of feed.sources) {
    if (!s.ok) console.log(`  FAILED ${s.display} (${s.id}): ${s.error}`);
  }
  const conflicts = kept.filter((g) => g.conflict);
  for (const g of conflicts) {
    console.log(
      `  CONFLICT ${g.date} ${g.home.team} v ${g.away.team}: ` +
        g.conflict.readings.map((r) => `${r.source} ${Object.values(r.scores).join('-')}`).join(' vs ') +
        (g.conflict.withheld
          ? ' — scores withheld'
          : g.conflict.resolved
            ? ` — settled by ${g.conflict.resolved.evidence}`
            : ' — keeping the verified result'),
    );
  }
  if (problems.length) {
    console.error(`\nFeed NOT written, ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }
  if (okCount === 0) {
    console.error('\nFeed NOT written: no source could be checked. Keeping the published file.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\nDry run: nothing written.');
    return;
  }

  // --- 5. write ---------------------------------------------------------------------------------
  await writeAtomic(FEED_PATH, JSON.stringify(feed));
  for (const r of results) {
    if (r.ok && (r.etag || r.lastModified)) {
      validators[r.cfg.id] = { etag: r.etag ?? null, lastModified: r.lastModified ?? null, at: r.checkedAt };
    }
  }
  await writeAtomic(ETAG_PATH, JSON.stringify(validators, null, 2));
  await writeAtomic(LOGO_PATH, JSON.stringify(Object.fromEntries([...logoUrls].sort()), null, 2));
  console.log(`\nWrote ${FEED_PATH} (started ${startedAt}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
