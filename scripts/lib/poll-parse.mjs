// The CWPA men's varsity national poll, read from the association's own article.
// Pure: takes HTML text in, gives a poll out. No network, no clock, no filesystem.
//
// Two rules the brief is explicit about, and that this module enforces:
//   * Points are COPIED from the published table. Nothing here computes or adjusts a number. The
//     conference standings elsewhere in this app use Paolo's own 3-points-per-win rule; that rule
//     must never touch these figures.
//   * Ranks are kept verbatim as strings — "6 (T)" is a tie and "RV" means receiving votes. Turning
//     them into integers would invent an ordering the CWPA did not publish.
//
// Each poll article carries four tables with identical headers: the national Top 20, the Division III
// Top 10, and the two conference Top 5s. They are told apart by the title row each one starts with,
// never by position, so a new table appearing on the page cannot be mistaken for the Top 20.

import { parseHTML } from 'linkedom';
import { teamSlug } from '../waterpolo.config.mjs';

const clean = (s) => String(s ?? '').replace(/ /g, ' ').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();

/** The national table's own title row. The Division III and conference tables fail this on purpose. */
const TOP20_TITLE = /Men's Varsity Top 20/i;
const HEADER_ROW = /^rank$/i;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const cells = (tr) => [...tr.querySelectorAll('th,td')].map((c) => clean(c.textContent));

/**
 * Every 2026 men's varsity weekly poll linked from the polls index, newest week first.
 * The preseason poll has no week number and is not returned: once the season is under way a
 * preseason table would be the wrong thing to show, and silently falling back to it would look
 * like a fresh poll.
 */
export function parsePollIndex(html, season) {
  const { document } = parseHTML(html);
  const found = new Map();
  const re = new RegExp(`/polls/${season}-mens-varsity-polls-week-(\\d+)(?:[-/]|$)`, 'i');
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    const m = href.match(re);
    if (!m) continue;
    const week = Number(m[1]);
    const url = href.startsWith('http') ? href : `https://collegiatewaterpolo.org${href}`;
    if (!found.has(week)) found.set(week, { week, url, label: clean(a.textContent) });
  }
  return [...found.values()].sort((x, y) => y.week - x.week);
}

/** "Sep 16, 2026" / "September 16, 2026" → "2026-09-16". Returns null rather than a guess. */
export function parsePublished(raw) {
  const s = clean(raw);
  const m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026 Week 2 Poll" → { week: 2, label: 'Week 2' }. The column header names the poll compared against. */
export function parsePreviousHeader(raw) {
  const m = clean(raw).match(/week\s*(\d+)/i);
  if (!m) return null;
  return { week: Number(m[1]), label: `Week ${m[1]}` };
}

function findTop20Table(document) {
  for (const t of document.querySelectorAll('table')) {
    const rows = [...t.querySelectorAll('tr')];
    if (rows.length < 2) continue;
    const title = clean(rows[0].textContent);
    if (!TOP20_TITLE.test(title)) continue;
    // Guard against a Division III or conference table whose title happens to contain the phrase.
    if (/division\s*iii|conference/i.test(title)) continue;
    return { table: t, rows, title };
  }
  return null;
}

/**
 * Parse one poll article. Returns `{ ok: true, poll }` or `{ ok: false, error }`.
 * `ctx` carries `{ url, season, week }`; the week in the article itself wins over the URL's.
 */
export function parsePollArticle(html, ctx) {
  const { document } = parseHTML(html);
  const hit = findTop20Table(document);
  if (!hit) return { ok: false, error: 'no "Men\'s Varsity Top 20" table on the page' };

  const headerIdx = hit.rows.findIndex((r) => cells(r).some((c) => HEADER_ROW.test(c)));
  if (headerIdx < 0) return { ok: false, error: 'the Top 20 table has no Rank/Team/Points header' };
  const head = cells(hit.rows[headerIdx]);
  const col = {
    rank: head.findIndex((c) => /^rank$/i.test(c)),
    team: head.findIndex((c) => /^team$/i.test(c)),
    previous: head.findIndex((c) => /poll$/i.test(c)),
    points: head.findIndex((c) => /^points$/i.test(c)),
  };
  if (col.rank < 0 || col.team < 0 || col.points < 0) {
    return { ok: false, error: `the Top 20 header is not the expected shape: ${head.join(' | ')}` };
  }

  const rows = [];
  for (const tr of hit.rows.slice(headerIdx + 1)) {
    const c = cells(tr);
    const name = clean(c[col.team]);
    const rank = clean(c[col.rank]);
    if (!name || !rank) continue;
    const pointsRaw = clean(c[col.points]);
    rows.push({
      // Verbatim, including "6 (T)" and "RV". The order of this array is the published order.
      rank,
      name,
      team: teamSlug(name),
      previous: col.previous >= 0 ? clean(c[col.previous]) || null : null,
      // Copied from the article. Never computed, never adjusted.
      points: /^\d+$/.test(pointsRaw) ? Number(pointsRaw) : null,
      pointsText: pointsRaw || null,
    });
  }

  const title = clean(hit.rows[0].textContent);
  const heading = clean(document.querySelector('h1')?.textContent ?? '');
  const weekFromTitle = title.match(/week\s*(\d+)/i) ?? heading.match(/week\s*(\d+)/i);
  const week = weekFromTitle ? Number(weekFromTitle[1]) : (ctx.week ?? null);

  const publishedAt =
    parsePublished(document.querySelector('.published')?.textContent) ??
    parsePublished(document.querySelector('time[datetime]')?.getAttribute('datetime')) ??
    parsePublished(heading) ??
    null;

  return {
    ok: true,
    poll: {
      season: ctx.season,
      week,
      title: title.replace(/\s*\(Week \d+\)\s*$/i, ''),
      heading: heading || title,
      publishedAt,
      previous: col.previous >= 0 ? parsePreviousHeader(head[col.previous]) : null,
      sourceUrl: ctx.url,
      rows,
    },
  };
}

/**
 * A parsed poll is only publishable when it is recognisably a full national poll.
 * A short or malformed table is rejected so the screen keeps the last verified one instead.
 */
export function validatePoll(poll, opts = {}) {
  const minRows = opts.minRows ?? 15;
  const problems = [];
  if (!poll) return ['nothing was parsed'];
  if (!Number.isInteger(poll.week) || poll.week < 1) problems.push('no week number');
  if (poll.season !== (opts.season ?? poll.season)) problems.push(`wrong season ${poll.season}`);
  if (!Array.isArray(poll.rows) || poll.rows.length < minRows) {
    problems.push(`only ${poll.rows?.length ?? 0} rows, expected at least ${minRows}`);
  }
  const ranked = (poll.rows ?? []).filter((r) => /^\d+/.test(r.rank));
  if (ranked.length < minRows) problems.push(`only ${ranked.length} numbered ranks`);
  if ((poll.rows ?? []).some((r) => !r.team)) problems.push('a row has no identifiable team');
  if ((poll.rows ?? []).every((r) => r.points === null)) problems.push('no points were readable');
  if (!poll.publishedAt) problems.push('no publication date');
  return problems;
}

/**
 * Is `next` allowed to replace `current`?
 * A stale job must never overwrite a newer poll, so an equal or older week is refused even when
 * the run that produced it is more recent.
 */
export function supersedes(next, current) {
  if (!current || !Number.isInteger(current.week)) return true;
  if (!next || !Number.isInteger(next.week)) return false;
  if (next.season !== current.season) return next.season > current.season;
  return next.week > current.week;
}
