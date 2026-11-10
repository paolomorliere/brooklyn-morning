// Gates a fetched schedule page before any of its games are trusted.
// Pure: HTML text and parsed rows in, a verdict out. A failing gate fails that one source,
// never the build, and never deletes what that source gave us last time.
//
// The trap this exists for: `wagnerathletics.com/sports/mens-polo/schedule/2019` returns 2019 games
// while its season <select> still reports `data-current` = 2026. `data-current` means "the program's
// current season", not "the season on this page", so it is useless as a validator. The page title is
// authoritative where present; where it is not (LIU prints no year), the game dates decide.

import { parseHTML } from 'linkedom';
import { SEASON, SEASON_END, SEASON_START } from '../waterpolo.config.mjs';

const clean = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Where a Sidearm page names its season and its sport. Some sites put it only in the browser title,
 * some only in a heading, and LIU only in `og:title` ("2026 Men's Water Polo Schedule") — its title
 * and H1 are just the university name. All three are read, none is required.
 */
export function pageHeadings(html) {
  const { document } = parseHTML(html);
  const meta = (prop) =>
    clean(
      document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ??
        document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content'),
    );
  return {
    title: clean(document.querySelector('title')?.textContent),
    h1: clean(document.querySelector('h1')?.textContent),
    ogTitle: meta('og:title'),
  };
}

/** The text the season and sport checks read, in one blob. */
const blobOf = (h) => `${h.title} ${h.h1} ${h.ogTitle ?? ''}`;

/**
 * Is this page the season we asked for?
 *   - a four-digit year in the title or H1 must equal `season`;
 *   - with no year anywhere, every parsed game date must fall inside the season window.
 * A page with no year and no games is indeterminate, which counts as a failure: we would rather
 * report a source as unchecked than import from a page we cannot identify.
 */
export function checkSeason(headings, rows, season = SEASON, window = { start: SEASON_START, end: SEASON_END }) {
  const claimed = blobOf(headings).match(/\b(20\d\d)\b/);
  if (claimed) {
    const year = Number(claimed[1]);
    return year === season
      ? { ok: true, how: `page says ${year}` }
      : { ok: false, why: `page is the ${year} season, expected ${season}` };
  }
  if (rows.length === 0) {
    return { ok: false, why: 'page names no season and lists no completed games' };
  }
  const outside = rows.filter((r) => r.date < window.start || r.date > window.end);
  if (outside.length > 0) {
    return {
      ok: false,
      why: `page names no season and ${outside.length} game date(s) fall outside ${window.start}…${window.end} (e.g. ${outside[0].date})`,
    };
  }
  return { ok: true, how: `no year on the page; all ${rows.length} game dates inside ${window.start}…${window.end}` };
}

const MENS = /\bmen'?s\s+water\s*polo\b/i;
const WOMENS = /\bwomen'?s\s+water\s*polo\b/i;

/**
 * Is this page men's water polo at the school we expect?
 *   - the URL path must carry the school's men's sport slug;
 *   - the page must name men's water polo, unless the registry records a `sportNote` exception;
 *   - a page that names women's water polo and not men's is always rejected.
 */
export function checkSport(url, headings, cfg) {
  const slug = cfg.sportSlug ?? 'mens-water-polo';
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return { ok: false, why: `unusable URL: ${url}` };
  }
  if (!path.includes(`/${slug}/`)) {
    return { ok: false, why: `URL path does not contain /${slug}/` };
  }
  const blob = blobOf(headings);
  if (WOMENS.test(blob) && !MENS.test(blob)) {
    return { ok: false, why: 'page names women’s water polo' };
  }
  if (MENS.test(blob)) return { ok: true, how: 'page names men’s water polo' };
  if (cfg.sportNote) return { ok: true, how: `sport not named on the page; accepted on record: ${cfg.sportNote}` };
  return { ok: false, why: 'page does not name men’s water polo and no exception is recorded' };
}

/** Both gates. `ok` only when both pass; `why` lists every reason it did not. */
export function validateSource(html, rows, cfg, season = SEASON) {
  const headings = pageHeadings(html);
  const sport = checkSport(cfg.url, headings, cfg);
  const seasonCheck = checkSeason(headings, rows, season);
  const problems = [sport, seasonCheck].filter((r) => !r.ok).map((r) => r.why);
  return {
    ok: problems.length === 0,
    why: problems.join('; ') || null,
    how: [sport.how, seasonCheck.how].filter(Boolean).join('; '),
    headings,
  };
}

/**
 * Problems with the feed as a whole, independent of any one game. Nothing can be published while
 * one of these stands: the file would be the wrong season or the wrong shape.
 */
export function feedProblems(feed) {
  const problems = [];
  if (feed.schemaVersion !== 1) problems.push(`unexpected schemaVersion ${feed.schemaVersion}`);
  if (feed.season !== SEASON) problems.push(`feed season ${feed.season} is not ${SEASON}`);
  if (!feed.teams || typeof feed.teams !== 'object') problems.push('teams table missing');
  return problems;
}

/**
 * Problems with one game, every one of them confined to that row. `seen` collects the ids already
 * accepted, so a duplicate is reported against the second row rather than the first.
 *
 * Kept separate from `feedProblems` for one reason: a single unsound row used to mean no feed was
 * written at all. On 2 November 2026 one impossible fixture — a school merged onto both sides of its
 * own game — stopped every water polo run for eight days, while the other 760 games were perfectly
 * good. Telling the two kinds of problem apart is what lets the caller drop the bad row, keep the
 * last published version of it if there was one, say so loudly, and still publish the day.
 */
export function gameProblems(g, feed, seen = new Set()) {
  const problems = [];
  const where = `${g.date} ${g.home?.team}/${g.away?.team}`;
  if (seen.has(g.id)) problems.push(`duplicate game id ${g.id} (${where})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date ?? '')) problems.push(`bad date on ${g.id}`);
  else if (g.date < SEASON_START || g.date > SEASON_END) problems.push(`${g.id} (${where}) is outside the season window`);
  if (!g.home?.team || !g.away?.team) problems.push(`${g.id} is missing a team`);
  if (g.home?.team === g.away?.team) problems.push(`${g.id} has the same team on both sides`);
  // Two kinds of game legitimately have no scores: one that has not been played yet, and one
  // whose sources disagree and was never verified.
  const notFinal = (g.status ?? 'final') !== 'final';
  const withheld = g.conflict && g.home?.score == null && g.away?.score == null;
  if (notFinal) {
    if (g.home?.score != null || g.away?.score != null) problems.push(`${g.id} (${where}) is ${g.status} but carries a score`);
  } else if (!withheld) {
    for (const side of ['home', 'away']) {
      const v = g[side]?.score;
      if (!Number.isInteger(v) || v < 0 || v > 99) problems.push(`${g.id} (${where}) has a bad ${side} score: ${v}`);
    }
  }
  if (!Array.isArray(g.sources) || g.sources.length === 0) problems.push(`${g.id} has no source provenance`);
  if (!feed.teams?.[g.home?.team]) problems.push(`${g.id} references unknown team ${g.home?.team}`);
  if (!feed.teams?.[g.away?.team]) problems.push(`${g.id} references unknown team ${g.away?.team}`);
  return problems;
}

/**
 * Last gate before the merged file is written: the whole feed must be internally sound.
 * Returns a list of human-readable problems; an empty list means write it.
 */
export function validateFeed(feed) {
  const problems = [];
  if (feed.schemaVersion !== 1) problems.push(`unexpected schemaVersion ${feed.schemaVersion}`);
  if (feed.season !== SEASON) problems.push(`feed season ${feed.season} is not ${SEASON}`);
  if (!Array.isArray(feed.games)) return ['games is not an array'];
  if (!feed.teams || typeof feed.teams !== 'object') problems.push('teams table missing');

  const seen = new Set();
  for (const g of feed.games) {
    problems.push(...gameProblems(g, feed, seen));
    seen.add(g.id);
  }
  return problems;
}

/**
 * The same checks as `validateFeed`, told apart by what they cost. `fatal` means publish nothing.
 * `rows` lists the individual games that are unsound, each with its reasons, so the caller can
 * decide what to do with those rows alone.
 */
export function partitionProblems(feed) {
  if (!Array.isArray(feed.games)) return { fatal: ['games is not an array'], rows: [] };
  const fatal = feedProblems(feed);
  const rows = [];
  const seen = new Set();
  for (const g of feed.games) {
    const problems = gameProblems(g, feed, seen);
    if (problems.length) rows.push({ game: g, problems });
    else seen.add(g.id);
  }
  return { fatal, rows };
}

/**
 * What to do about the rows that failed validation. This is the whole lesson of the outage of
 * 2–10 November 2026, written down as a function.
 *
 *   * a `fatal` problem — wrong season, wrong schema, no teams table — means publish nothing;
 *   * a handful of unsound rows means publish the feed without them;
 *   * more unsound rows than `limit` is not bad data but a broken build, so publish nothing.
 *
 * A row is only dropped if there is nothing better. If the published feed already holds that game
 * and that published version still validates, it is kept instead, so a source that starts returning
 * nonsense costs today's reading of a game rather than the game itself. That is the same promise the
 * per-source gate already makes, extended to the row.
 *
 * Pure: it returns the games to write and what it did, and writes nothing itself.
 */
export function quarantineRows(feed, previous = null, limit = null) {
  const { fatal, rows } = partitionProblems(feed);
  const games = Array.isArray(feed.games) ? feed.games : [];
  // Five, or one percent, whichever is larger: enough headroom for the odd impossible fixture,
  // small enough that a parser regression still stops the build.
  const allowed = limit ?? Math.max(5, Math.ceil(games.length * 0.01));
  const systemic = rows.length > allowed;
  if (fatal.length || systemic || rows.length === 0) {
    return { games, rescued: [], discarded: [], fatal, rows, systemic, limit: allowed, write: fatal.length === 0 && !systemic };
  }

  const publishedById = new Map((previous?.games ?? []).map((g) => [g.id, g]));
  const bad = new Set(rows.map((r) => r.game));
  const reasons = new Map(rows.map((r) => [r.game, r.problems]));
  const rescued = [];
  const discarded = [];
  const next = [];
  for (const g of games) {
    if (!bad.has(g)) {
      next.push(g);
      continue;
    }
    const before = publishedById.get(g.id);
    if (before && before !== g && gameProblems(before, feed).length === 0) {
      next.push(before);
      rescued.push({ game: g, problems: reasons.get(g) });
    } else {
      discarded.push({ game: g, problems: reasons.get(g) });
    }
  }
  return { games: next, rescued, discarded, fatal, rows, systemic, limit: allowed, write: true };
}
