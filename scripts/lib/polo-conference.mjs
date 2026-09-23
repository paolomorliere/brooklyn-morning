// Which games are conference games, decided by the CWPA's own published conference schedules.
// Pure: takes HTML text in, gives fixtures out. No network, no clock, no filesystem.
//
// The rule this module exists to enforce: a game is a conference game because the conference lists
// it, never because the two teams happen to share a conference. Fordham and Navy are both MAWPC and
// also meet at invitationals; only the fixtures printed on the conference schedule count.
//
//   https://collegiatewaterpolo.org/2026-mid-atlantic-water-polo-conference-schedule/
//   https://collegiatewaterpolo.org/2026-northeast-water-polo-conference-schedule/
//
// Each page carries several tables with the same header. Only the first — the regular season — is
// read. The championship bracket further down is deliberately excluded: its rows are seeds rather
// than teams while the season is running, and a conference tournament is not a regular-season game.

import { parseHTML } from 'linkedom';
import { isNonTeam, teamSlug } from '../waterpolo.config.mjs';
import { parseGameDate, parseTime } from './polo-parse.mjs';

const clean = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Rows whose "matchup" is a bracket placeholder rather than two teams. */
const PLACEHOLDER = /\b(seed|winner|loser|tbd|tba|bye|consolation|championship|semifinal|quarterfinal)\b/i;

/** The header that identifies a schedule table, whichever page it is on. */
const MATCHUP_HEADER = /matchup/i;

const cells = (tr) => [...tr.querySelectorAll('th,td')].map((c) => clean(c.textContent));

/**
 * "Mount St. Mary's University vs. U.S. Naval Academy" → the two slugs.
 * The CWPA prints the dark-cap team first; that is a cap colour, not a home team, so it is not used.
 */
export function parseMatchup(raw) {
  const s = clean(raw).replace(/\s*\(Game \d+\)\s*$/i, '');
  if (!s || PLACEHOLDER.test(s)) return null;
  const m = s.split(/\s+vs\.?\s+/i);
  if (m.length !== 2) return null;
  const [a, b] = m.map((x) => clean(x));
  if (!a || !b || isNonTeam(a) || isNonTeam(b)) return null;
  const slugs = [teamSlug(a), teamSlug(b)];
  if (!slugs[0] || !slugs[1] || slugs[0] === slugs[1]) return null;
  return { names: [a, b], slugs };
}

/** A score cell is a number or empty. Anything else is not a result and is ignored. */
function scoreOf(raw) {
  const s = clean(raw);
  if (!/^\d{1,3}$/.test(s)) return null;
  return Number(s);
}

/** Stable key for a fixture: the date and the sorted pair, exactly what the merge buckets on. */
export function fixtureKey(date, a, b) {
  return `${date}|${[a, b].sort().join('|')}`;
}

/**
 * Parse one conference schedule page.
 * Returns `{ conference, url, fixtures, skipped, ambiguous }`; `skipped` records every row that
 * was not turned into a fixture and why, so a page change shows up in the build log rather than
 * silently shrinking the conference schedule.
 */
export function parseConferenceSchedule(html, ctx) {
  const { document } = parseHTML(html);
  const table = [...document.querySelectorAll('table')].find((t) => {
    const head = cells(t.querySelector('tr') ?? t);
    return head.some((c) => MATCHUP_HEADER.test(c));
  });
  if (!table) return { conference: ctx.conference, url: ctx.url, fixtures: [], skipped: [], ambiguous: [], error: 'no schedule table found' };

  const rows = [...table.querySelectorAll('tr')];
  const head = cells(rows[0]);
  const col = {
    date: head.findIndex((c) => /^date/i.test(c)),
    matchup: head.findIndex((c) => MATCHUP_HEADER.test(c)),
    dark: head.findIndex((c) => /dark score/i.test(c)),
    white: head.findIndex((c) => /white score/i.test(c)),
  };
  if (col.date < 0 || col.matchup < 0) {
    return { conference: ctx.conference, url: ctx.url, fixtures: [], skipped: [], ambiguous: [], error: 'schedule table has no date or matchup column' };
  }

  const fixtures = [];
  const skipped = [];
  const seen = new Map();

  for (const tr of rows.slice(1)) {
    const c = cells(tr);
    const rawMatchup = c[col.matchup] ?? '';
    if (!clean(rawMatchup) && !clean(c[col.date] ?? '')) continue; // the blank spacer rows between weekends

    const pair = parseMatchup(rawMatchup);
    if (!pair) {
      skipped.push({ row: rawMatchup, why: 'not two identifiable teams' });
      continue;
    }
    const when = parseGameDate(c[col.date] ?? '', ctx.seasonYear);
    if (!when) {
      skipped.push({ row: `${c[col.date]} — ${rawMatchup}`, why: 'no readable date' });
      continue;
    }

    const key = fixtureKey(when.date, pair.slugs[0], pair.slugs[1]);
    const fixture = {
      key,
      conference: ctx.conference,
      url: ctx.url,
      date: when.date,
      // "(Noon)" is a time the site writes in words; anything else falls through to the usual parser.
      time: /\bnoon\b/i.test(c[col.date] ?? '') ? '12:00' : (when.time ?? parseTime(c[col.date] ?? '')),
      teams: [...pair.slugs].sort(),
      names: pair.names,
      // Kept only so the build can flag a disagreement with the schools' own pages. Never displayed
      // and never merged into the feed's scores — the schools remain the source for results.
      cwpaScores:
        col.dark >= 0 && col.white >= 0
          ? { [pair.slugs[0]]: scoreOf(c[col.dark]), [pair.slugs[1]]: scoreOf(c[col.white]) }
          : null,
    };
    if (seen.has(key)) seen.get(key).push(fixture);
    else seen.set(key, [fixture]);
    fixtures.push(fixture);
  }

  // The same pair on the same date twice would make "which meeting was the conference game"
  // unanswerable from this table. Report it rather than classifying both.
  const ambiguous = [...seen.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);

  return { conference: ctx.conference, url: ctx.url, fixtures, skipped, ambiguous };
}

/**
 * Combine parsed schedules into one lookup. A key that is ambiguous on its own page, or that two
 * conferences both claim, is dropped: an unclassified game is correct, a guessed one is not.
 */
export function indexFixtures(schedules) {
  const index = new Map();
  const dropped = [];
  for (const s of schedules) {
    for (const f of s.fixtures) {
      if (s.ambiguous.includes(f.key)) {
        if (!dropped.includes(f.key)) dropped.push(f.key);
        index.delete(f.key);
        continue;
      }
      const prior = index.get(f.key);
      if (prior && prior.conference !== f.conference) {
        dropped.push(f.key);
        index.delete(f.key);
        continue;
      }
      index.set(f.key, f);
    }
  }
  return { index, dropped };
}

/**
 * The conference classification for one merged game, or null.
 * `game.teams` is the sorted pair the merge already built.
 */
export function classifyGame(game, index) {
  const f = index.get(fixtureKey(game.date, game.teams[0], game.teams[1]));
  if (!f) return null;
  return { conference: f.conference, conferenceSource: f.url };
}
