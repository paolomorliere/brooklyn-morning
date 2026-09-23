// Builds public/data/poll.json: the CWPA men's varsity national Top 20 as published.
//
//   node scripts/build-poll.mjs             find the newest poll, write it if it is newer
//   node scripts/build-poll.mjs --dry-run   do everything except write
//   node scripts/build-poll.mjs --url=…     read one specific poll article
//
// What "success" means here is deliberately narrow, because the Thursday backup run depends on it:
// a run succeeds only when it finds an article for a NEWER week than the one already published,
// parses its Top 20 table, validates it and writes it. Fetching the index, getting an HTTP 200, or
// finding last week's poll again are all failures for scheduling purposes, and the script says so
// in its exit code and in the `saved`/`week` lines it writes to $GITHUB_OUTPUT.
//
// Points and ranks are copied from the article exactly. Nothing in this pipeline computes a poll
// number; the 3-points-per-win rule used for the conference standings must never touch these.

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { POLL_INDEX_URL, SEASON, WATCHED_IDS, displayName, teamSlug } from './waterpolo.config.mjs';
import { parsePollArticle, parsePollIndex, supersedes, validatePoll } from './lib/poll-parse.mjs';

const POLL_PATH = 'public/data/poll.json';
const LOGO_PATH = 'state/waterpolo-logos.json';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE_URL = (args.find((a) => a.startsWith('--url=')) ?? '').split('=').slice(1).join('=') || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJSON(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeAtomic(path, body) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, path);
}

async function fetchPage(url, attempt = 0) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if (attempt < ATTEMPTS - 1) {
      await sleep(1200 * (attempt + 1));
      return fetchPage(url, attempt + 1);
    }
    throw e;
  }
}

/** Tell the workflow what happened, so it only claims the week when one was actually saved. */
async function report(saved, week, why) {
  console.log(`${saved ? 'saved' : 'not saved'}: ${why}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `saved=${saved}\nweek=${week ?? ''}\n`);
  }
}

async function main() {
  await mkdir('public/data', { recursive: true });
  const previous = await readJSON(POLL_PATH, null);
  const attemptedAt = new Date().toISOString();

  let target;
  if (FORCE_URL) {
    target = { week: null, url: FORCE_URL };
  } else {
    const index = parsePollIndex(await fetchPage(POLL_INDEX_URL), SEASON);
    if (index.length === 0) {
      await report(false, null, `no ${SEASON} weekly poll is linked from ${POLL_INDEX_URL}`);
      await keepPrevious(previous, attemptedAt, `no ${SEASON} poll found on the index`);
      process.exit(1);
    }
    target = index[0];
    console.log(`newest ${SEASON} poll on the index: week ${target.week} — ${target.url}`);
    if (previous && !supersedes({ season: SEASON, week: target.week }, previous)) {
      await report(false, target.week, `week ${target.week} is not newer than the published week ${previous.week}`);
      await keepPrevious(previous, attemptedAt, `week ${previous.week} is still the newest poll published`);
      return; // not an error: the CWPA simply has not posted this week's poll yet
    }
  }

  const parsed = parsePollArticle(await fetchPage(target.url), { url: target.url, season: SEASON, week: target.week });
  if (!parsed.ok) {
    await report(false, target.week, parsed.error);
    await keepPrevious(previous, attemptedAt, parsed.error);
    process.exit(1);
  }

  const problems = validatePoll(parsed.poll, { season: SEASON });
  if (problems.length) {
    await report(false, parsed.poll.week, `the parsed table did not validate: ${problems.join('; ')}`);
    await keepPrevious(previous, attemptedAt, problems.join('; '));
    process.exit(1);
  }
  // A second, independent guard against a stale job: the week that was actually parsed out of the
  // article must beat the published one, whatever the index link claimed.
  if (previous && !supersedes(parsed.poll, previous)) {
    await report(false, parsed.poll.week, `the article is week ${parsed.poll.week}, not newer than the published week ${previous.week}`);
    await keepPrevious(previous, attemptedAt, `week ${previous.week} is still the newest poll published`);
    return;
  }

  const logoUrls = await readJSON(LOGO_PATH, {});
  const teams = {};
  const missing = [];
  for (const r of parsed.poll.rows) {
    if (teams[r.team]) continue;
    const logo = logoUrls[r.team] ? `logos/${r.team}.webp` : null;
    if (!logo) missing.push(r.team);
    teams[r.team] = { name: displayName(r.team, r.name), watched: WATCHED_IDS.has(r.team), logo };
  }

  const poll = {
    schemaVersion: 1,
    season: SEASON,
    week: parsed.poll.week,
    title: parsed.poll.title,
    heading: parsed.poll.heading,
    publishedAt: parsed.poll.publishedAt,
    previous: parsed.poll.previous,
    sourceUrl: parsed.poll.sourceUrl,
    indexUrl: POLL_INDEX_URL,
    builtAt: new Date().toISOString(),
    lastAttemptAt: attemptedAt,
    lastSuccessAt: new Date().toISOString(),
    awaiting: false,
    note: null,
    teams,
    rows: parsed.poll.rows,
  };

  console.log(`${poll.title} · week ${poll.week} · published ${poll.publishedAt} · ${poll.rows.length} rows`);
  for (const r of poll.rows) console.log(`  ${r.rank.padEnd(7)} ${String(r.points ?? r.pointsText ?? '').padStart(4)}  ${r.name}`);
  if (missing.length) console.log(`no logo yet: ${missing.join(', ')} — the screen shows initials and the next run retries`);

  if (DRY_RUN) {
    console.log('\nDry run: nothing written.');
    await report(false, poll.week, 'dry run');
    return;
  }
  await writeAtomic(POLL_PATH, JSON.stringify(poll));
  console.log(`\nWrote ${POLL_PATH}.`);
  await report(true, poll.week, `week ${poll.week} written`);
}

/**
 * Keep the last verified poll exactly as it is, recording only that a check happened and did not
 * produce a newer one. The screen then shows that poll's real week and date, labelled as awaiting
 * this week's — never a blank screen and never a stale week presented as current.
 */
async function keepPrevious(previous, attemptedAt, why) {
  if (!previous || DRY_RUN) return;
  // Crests and display names are the two things that may change without a new poll: a logo
  // downloaded since the last run, or a shorter name added to the registry, should appear straight
  // away rather than waiting a week. Ranks, previous ranks and points are untouched — and `rows`,
  // which holds the CWPA's own wording, is not rewritten at all.
  const logoUrls = await readJSON(LOGO_PATH, {});
  const published = new Map((previous.rows ?? []).map((r) => [r.team, r.name]));
  const teams = Object.fromEntries(
    Object.entries(previous.teams ?? {}).map(([slug, t]) => [
      slug,
      {
        ...t,
        name: displayName(slug, published.get(slug) ?? t.name),
        logo: logoUrls[slug] ? `logos/${slug}.webp` : t.logo,
      },
    ]),
  );
  await writeAtomic(POLL_PATH, JSON.stringify({ ...previous, teams, lastAttemptAt: attemptedAt, awaiting: true, note: why }));
  const still = Object.entries(teams).filter(([, t]) => !t.logo).map(([s]) => s);
  console.log(`Kept the published week ${previous.week}; recorded the attempt (${why}).` + (still.length ? ` Still no logo for ${still.join(', ')}.` : ''));
}

main().catch(async (e) => {
  console.error(e);
  await report(false, null, (e && e.message) || String(e));
  process.exit(1);
});
