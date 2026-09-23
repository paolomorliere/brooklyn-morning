// Builds public/data/waterpolo.json: completed 2026 NCAA men's water polo games involving a watched team.
//
//   node scripts/build-waterpolo.mjs                 fetch all 13 schools, reconcile, write
//   node scripts/build-waterpolo.mjs --dry-run       do everything except write
//   node scripts/build-waterpolo.mjs --school=liu    one school (still merges into the archive)
//   node scripts/build-waterpolo.mjs --no-conditional  ignore stored ETags and refetch everything
//   node scripts/build-waterpolo.mjs --no-opponents   skip the opponent-season pass
//   node scripts/build-waterpolo.mjs --no-conference  skip the CWPA conference classification
//
// The run has three passes:
//   1. the 13 watched schools — these alone decide the main feed and the freshness line;
//   2. every opponent those schools played, so a team screen can show that team's whole season;
//   3. the CWPA's two conference schedules, which are the only thing that marks a game as a
//      conference game. Two teams sharing a conference is never enough.
//
// Rules this file exists to keep:
//   * each source is fetched and parsed in isolation, so one failure cannot stop the others;
//   * a source that fails is reported as failed and keeps its previous games — never deleted,
//     never silently shown as freshly checked;
//   * an opponent page has to prove it is that opponent's page before its games are believed;
//   * the merged feed is validated before it replaces the old one, and written via a temp file
//     so an interrupted run cannot leave half a file behind.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import {
  ATHLETICS_SITES,
  CONFERENCES,
  SCHOOLS,
  SEASON,
  SPORT_LABEL,
  WATCHED_IDS,
  conferenceOf,
  displayName,
  rosterPath,
  schedulePath,
  schoolFor,
  teamSlug,
} from './waterpolo.config.mjs';
import { parseSchedule } from './lib/polo-parse.mjs';
import { classifyGame, indexFixtures, parseConferenceSchedule } from './lib/polo-conference.mjs';
import { validateFeed, validateSource } from './lib/polo-validate.mjs';
import { buildTeams, fromFeedGames, involvesWatched, mergeGames, teamPair, toCandidates, toFeedGames } from './lib/polo-merge.mjs';

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
const NO_OPPONENTS = args.includes('--no-opponents');
const NO_CONFERENCE = args.includes('--no-conference');

/** Sport slugs to try on an opponent's site, in order. Most schools use the first. */
const OPPONENT_SPORT_SLUGS = ['mens-water-polo', 'mens-polo', 'mens-waterpolo', 'men-s-water-polo'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "4 MAWPC, 1 NWPC" for the build log. */
const CONFERENCE_COUNT = (games) => {
  const by = {};
  for (const g of games) by[g.conference] = (by[g.conference] ?? 0) + 1;
  return Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
};

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

/** A plain GET with the same timeout and retry budget as a schedule fetch. */
async function fetchPage(url, attempt = 0) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status}`);
      // A 404 is an answer, not a hiccup: this school does not publish that path. Retrying it
      // three times only makes the run slower and the site's logs noisier.
      err.final = r.status >= 400 && r.status < 500;
      throw err;
    }
    return { url: r.url, html: await r.text() };
  } catch (e) {
    if (!e?.final && attempt < ATTEMPTS - 1) {
      await sleep(1200 * (attempt + 1));
      return fetchPage(url, attempt + 1);
    }
    throw e;
  }
}

/**
 * Does this page really belong to `slug`?
 *
 * Schools mislink each other — one watched school links "UC San Diego" to usdtoreros.com, the
 * University of San Diego — so a page that merely parses is not proof of identity. The check is
 * that the page reports at least one game we already know this team played: same date, same
 * opponent. Nothing is imported from a page that cannot show that.
 */
function corroborates(slug, rows, known) {
  const want = known.get(slug);
  if (!want || want.size === 0) return { ok: false, why: 'no known game to check the page against' };
  for (const row of rows) {
    if (want.has(`${row.date}|${teamSlug(row.opponentRaw)}`)) {
      return { ok: true, how: `page lists this team's known game on ${row.date}` };
    }
  }
  return { ok: false, why: 'page lists none of the games this team is already known to have played' };
}

/**
 * One opponent's 2026 season. Tries the Sidearm schedule paths in turn and stops at the first page
 * that validates for season and sport AND proves it is this team's page.
 */
async function fetchOpponentSeason(slug, sites, known) {
  const tried = [];
  // Every site any school linked for this team, most-linked first, each with every sport path.
  // One watched school links "UC Santa Barbara" to Stanford's site and another links "UC San Diego"
  // to the University of San Diego's, so a single hint is not enough and no hint is trusted on its
  // own — whatever is fetched still has to prove it is this team's page.
  const attempts = [];
  for (const sportSlug of OPPONENT_SPORT_SLUGS) {
    for (const site of sites) {
      // The season-pinned path first. Some schools only publish the unpinned one, which shows the
      // current season — safe to read only because the season gate rejects any page that is not 2026.
      attempts.push({ site, sportSlug, path: schedulePath(sportSlug) });
      attempts.push({ site, sportSlug, path: `/sports/${sportSlug}/schedule` });
    }
  }
  const deadSites = new Set();
  for (const { site, sportSlug, path } of attempts) {
    if (deadSites.has(site)) continue;
    const url = `${site}${path}`;
    let page;
    try {
      page = await fetchPage(url);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      tried.push(`${url}: ${msg}`);
      // A host that cannot be reached at all will not be reachable on another path either.
      if (/fetch failed|timed out|ENOTFOUND|certificate/i.test(msg)) deadSites.add(site);
      continue;
    }
    const cfg = { id: slug, url, sportSlug, display: displayName(slug, slug) };
    const rows = parseSchedule(page.html, { url, generation: 'classic', seasonYear: SEASON });
    const ngRows = rows.length ? rows : parseSchedule(page.html, { url, generation: 'nextgen', seasonYear: SEASON });
    const found = rows.length ? rows : ngRows;
    const generation = rows.length ? 'classic' : 'nextgen';

    const verdict = validateSource(page.html, found, cfg, SEASON);
    if (!verdict.ok) {
      tried.push(`${url}: ${verdict.why}`);
      continue;
    }
    const proof = corroborates(slug, found, known);
    if (!proof.ok) {
      tried.push(`${url}: ${proof.why}`);
      continue;
    }
    return { ok: true, cfg: { ...cfg, generation }, rows: found, note: `${verdict.how}; ${proof.how}`, rosterUrl: `${site}${rosterPath(sportSlug)}` };
  }
  return { ok: false, why: tried.join(' | ') || 'no athletics site is linked for this team' };
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
  const siteHints = new Map();
  const absorb = (rows) => {
    for (const row of rows) {
      const slug = teamSlug(row.opponentRaw);
      names.set(slug, row.opponentRaw);
      if (row.opponentLogo && !logoUrls.has(slug)) logoUrls.set(slug, row.opponentLogo);
      if (row.opponentSite) {
        if (!siteHints.has(slug)) siteHints.set(slug, new Map());
        const seen = siteHints.get(slug);
        seen.set(row.opponentSite, (seen.get(row.opponentSite) ?? 0) + 1);
      }
    }
  };

  const candidates = [];
  for (const r of results) {
    if (!r.ok || r.rows.length === 0) continue;
    absorb(r.rows);
    candidates.push(...toCandidates(r.rows, r.cfg, r.checkedAt, SEASON));
  }
  // Deterministic order in, deterministic feed out.
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.source.id.localeCompare(b.source.id) || a.slot - b.slot);

  let { games, stats } = mergeGames(archive, candidates);

  // --- 2b. every opponent's own season ----------------------------------------------------------
  // Team screens show a team's whole 2026, including the games it played against schools that are
  // not on the watchlist. Those only exist on that school's own page, so each one is fetched once.
  // The watchlist, the main feed and the freshness line are untouched by this pass.
  const opponentSources = previous?.opponentSources ? [...previous.opponentSources] : [];
  if (!NO_OPPONENTS && !ONLY) {
    const known = new Map();
    for (const g of games) {
      const [a, b] = g.teams;
      for (const [self, other] of [[a, b], [b, a]]) {
        if (!known.has(self)) known.set(self, new Set());
        known.get(self).add(`${g.date}|${other}`);
      }
    }
    // Only the teams a watched school actually played. Their own opponents are not fetched in turn:
    // the feed would grow without bound, and a team three steps from the watchlist has no screen.
    const direct = new Set();
    for (const g of games) {
      if (!involvesWatched({ home: { team: g.teams[0] }, away: { team: g.teams[1] } })) continue;
      for (const slug of g.teams) if (!WATCHED_IDS.has(slug)) direct.add(slug);
    }
    const sitesFor = (slug) => {
      const linked = [...(siteHints.get(slug)?.entries() ?? [])]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([u]) => u);
      const known = ATHLETICS_SITES[slug];
      return known ? [known, ...linked.filter((u) => u !== known)] : linked;
    };
    const targets = [...direct].filter((slug) => sitesFor(slug).length > 0).sort();
    const unlinked = [...direct].filter((slug) => sitesFor(slug).length === 0).sort();

    const opp = await pooled(targets, CONCURRENCY, async (slug) => {
      const checkedAt = new Date().toISOString();
      const sites = sitesFor(slug);
      const site = sites[0];
      try {
        const got = await fetchOpponentSeason(slug, sites, known);
        await sleep(150); // politeness between requests to the same kind of host
        return got.ok
          ? { slug, site, ok: true, checkedAt, ...got }
          : { slug, site, ok: false, checkedAt, error: got.why, rows: [] };
      } catch (e) {
        return { slug, site, ok: false, checkedAt, error: (e && e.message) || String(e), rows: [] };
      }
    });

    const oppCandidates = [];
    for (const r of opp) {
      if (!r.ok || r.rows.length === 0) continue;
      absorb(r.rows);
      oppCandidates.push(...toCandidates(r.rows, r.cfg, r.checkedAt, SEASON));
    }
    oppCandidates.sort((a, b) => a.date.localeCompare(b.date) || a.source.id.localeCompare(b.source.id) || a.slot - b.slot);
    if (oppCandidates.length) {
      // Round-tripping through the feed shape hands pass 1's games to the merge as the archive:
      // they have just been verified against the schools' own pages, so where an opponent's page
      // disagrees the watched school's number stays and the disagreement is recorded on the game.
      const merged = mergeGames(fromFeedGames(toFeedGames(games)), oppCandidates);
      games = merged.games;
      stats = { ...stats, opponentAdded: merged.stats.added, opponentConflicts: merged.stats.conflicts };
    }

    opponentSources.length = 0;
    for (const r of opp) {
      opponentSources.push({
        id: r.slug,
        url: r.ok ? r.cfg.url : null,
        site: r.site,
        ok: r.ok,
        checkedAt: r.checkedAt,
        found: r.ok ? r.rows.length : 0,
        rosterUrl: r.ok ? r.rosterUrl : null,
        error: r.ok ? null : r.error,
        note: r.ok ? r.note : null,
      });
    }
    for (const slug of unlinked) {
      opponentSources.push({
        id: slug, url: null, site: null, ok: false, checkedAt: startedAt, found: 0, rosterUrl: null,
        error: 'no athletics site is linked from any page that lists this team', note: null,
      });
    }
    opponentSources.sort((a, b) => a.id.localeCompare(b.id));
  }

  // --- 2c. conference classification ------------------------------------------------------------
  const conference = { checkedAt: new Date().toISOString(), sources: [], classified: 0, dropped: [] };
  if (!NO_CONFERENCE) {
    const parsed = [];
    for (const c of Object.values(CONFERENCES)) {
      try {
        const page = await fetchPage(c.scheduleUrl);
        const result = parseConferenceSchedule(page.html, { conference: c.id, url: c.scheduleUrl, seasonYear: SEASON });
        if (result.error) throw new Error(result.error);
        parsed.push(result);
        conference.sources.push({ id: c.id, url: c.scheduleUrl, ok: true, fixtures: result.fixtures.length, skipped: result.skipped.length, error: null });
      } catch (e) {
        conference.sources.push({ id: c.id, url: c.scheduleUrl, ok: false, fixtures: 0, skipped: 0, error: (e && e.message) || String(e) });
      }
    }
    if (parsed.length) {
      const { index, dropped: amb } = indexFixtures(parsed);
      conference.dropped = amb;
      // Only reclassify when at least one schedule was read. A failed fetch leaves the previous
      // classification in place rather than quietly un-marking every conference game.
      const seen = new Set(parsed.map((x) => x.conference));
      for (const g of games) {
        const hit = classifyGame(g, index);
        if (hit) {
          g.conference = hit.conference;
          g.conferenceSource = hit.conferenceSource;
          conference.classified++;
        } else if (g.conference && seen.has(g.conference)) {
          // The conference that used to list this fixture was read successfully and no longer
          // lists it. Trust the source of record and clear the mark.
          g.conference = null;
          g.conferenceSource = null;
        }
      }
    }
  }

  const all = toFeedGames(games);
  const kept = NO_OPPONENTS || ONLY ? all.filter(involvesWatched) : all;
  const dropped = all.length - all.filter(involvesWatched).length;

  // --- 3. assemble and validate the whole feed ---------------------------------------------------
  const logos = new Map();
  for (const slug of new Set(kept.flatMap((g) => [g.home.team, g.away.team]))) {
    if (logoUrls.has(slug)) logos.set(slug, `logos/${slug}.webp`);
  }
  for (const s of SCHOOLS) names.set(s.id, s.display);

  const teams = buildTeams(kept, names, logos);
  // What each team screen may honestly claim. `full` means this team's own 2026 schedule page was
  // read this run; `partial` means the games shown are only the ones other schools reported.
  const oppById = new Map(opponentSources.map((o) => [o.id, o]));
  for (const [slug, t] of Object.entries(teams)) {
    const school = schoolFor(slug);
    const own = school ? results.find((r) => r.cfg.id === slug) : null;
    const opp = oppById.get(slug) ?? null;
    t.conference = conferenceOf(slug);
    if (school) {
      t.coverage = own ? (own.ok ? 'full' : 'partial') : (previous?.teams?.[slug]?.coverage ?? 'full');
      t.scheduleUrl = school.url;
      t.rosterUrl = `${school.site}${rosterPath(school.sportSlug ?? 'mens-water-polo')}`;
    } else if (opp?.ok) {
      t.coverage = 'full';
      t.scheduleUrl = opp.url;
      t.rosterUrl = opp.rosterUrl;
    } else {
      t.coverage = 'partial';
      t.scheduleUrl = opp?.site ?? null;
      t.rosterUrl = null;
      t.coverageNote = opp?.error ?? 'this team\u2019s own 2026 schedule could not be read';
    }
  }

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
    teams,
    games: kept,
    // The watched schools stay in `sources`, which is what the freshness line counts. Opponent
    // pages are reported separately so "13 of 13 schools" keeps meaning exactly what it did.
    opponentSources,
    conference: {
      ...conference,
      // Membership is a fact about the season, not about this run, so it is published either way.
      members: Object.fromEntries(Object.values(CONFERENCES).map((c) => [c.id, { name: c.name, short: c.short, scheduleUrl: c.scheduleUrl, members: c.members }])),
    },
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
      (stats.opponentAdded ? ` · +${stats.opponentAdded} from opponent pages` : '') +
      (dropped ? ` · ${dropped} involve no watched team` : ''),
  );
  for (const s of feed.sources) {
    if (!s.ok) console.log(`  FAILED ${s.display} (${s.id}): ${s.error}`);
  }

  if (opponentSources.length) {
    const oppOk = opponentSources.filter((o) => o.ok).length;
    console.log(`opponent seasons ${oppOk}/${opponentSources.length} read`);
    for (const o of opponentSources) {
      if (!o.ok) console.log(`  UNREAD ${o.id}: ${o.error}`);
    }
  }

  for (const c of conference.sources) {
    console.log(
      c.ok
        ? `conference ${c.id}: ${c.fixtures} fixtures published${c.skipped ? `, ${c.skipped} row(s) not read` : ''}`
        : `  FAILED conference ${c.id}: ${c.error}`,
    );
  }
  if (conference.sources.some((c) => c.ok)) {
    const marked = kept.filter((g) => g.conference);
    console.log(`conference games classified: ${marked.length} (${CONFERENCE_COUNT(marked)})`);
    // A school that printed a conference badge on a game the CWPA does not list is worth seeing:
    // it is either a schedule the CWPA has not published yet or a mislabelled row. It stays
    // unclassified either way.
    for (const g of kept) {
      if (!g.conference && g.conferenceMarker) {
        console.log(`  UNLISTED ${g.date} ${g.home.team} v ${g.away.team} — the school marks it "${g.conferenceMarker}" but the CWPA schedule does not list it`);
      }
    }
    for (const key of conference.dropped) console.log(`  AMBIGUOUS conference fixture ${key} — left unclassified`);
  }

  const missingLogos = Object.entries(feed.teams).filter(([, t]) => !t.logo).map(([slug]) => slug);
  if (missingLogos.length) console.log(`no logo yet: ${missingLogos.join(', ')}`);
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
