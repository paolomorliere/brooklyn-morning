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
 * Last gate before the merged file is written: the whole feed must be internally sound.
 * Returns a list of human-readable problems; an empty list means write it.
 */
export function validateFeed(feed) {
  const problems = [];
  if (feed.schemaVersion !== 1) problems.push(`unexpected schemaVersion ${feed.schemaVersion}`);
  if (feed.season !== SEASON) problems.push(`feed season ${feed.season} is not ${SEASON}`);
  if (!Array.isArray(feed.games)) return ['games is not an array'];
  if (!feed.teams || typeof feed.teams !== 'object') problems.push('teams table missing');

  const ids = new Set();
  for (const g of feed.games) {
    const where = `${g.date} ${g.home?.team}/${g.away?.team}`;
    if (ids.has(g.id)) problems.push(`duplicate game id ${g.id} (${where})`);
    ids.add(g.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date ?? '')) problems.push(`bad date on ${g.id}`);
    else if (g.date < SEASON_START || g.date > SEASON_END) problems.push(`${g.id} (${where}) is outside the season window`);
    if (!g.home?.team || !g.away?.team) problems.push(`${g.id} is missing a team`);
    if (g.home?.team === g.away?.team) problems.push(`${g.id} has the same team on both sides`);
    // A withheld game (sources disagree, never verified) legitimately has no scores.
    const withheld = g.conflict && g.home?.score == null && g.away?.score == null;
    if (!withheld) {
      for (const side of ['home', 'away']) {
        const v = g[side]?.score;
        if (!Number.isInteger(v) || v < 0 || v > 99) problems.push(`${g.id} (${where}) has a bad ${side} score: ${v}`);
      }
    }
    if (!Array.isArray(g.sources) || g.sources.length === 0) problems.push(`${g.id} has no source provenance`);
    if (!feed.teams?.[g.home?.team]) problems.push(`${g.id} references unknown team ${g.home?.team}`);
    if (!feed.teams?.[g.away?.team]) problems.push(`${g.id} references unknown team ${g.away?.team}`);
  }
  return problems;
}
