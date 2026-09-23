// Deterministic extraction of completed games from the two Sidearm generations.
// Pure: takes HTML text in, gives normalized rows out. No network, no clock, no filesystem.
//
// Both generations print the result from the page owner's perspective ("W, 16-15" = this school scored 16),
// so `us`/`them` are unambiguous. Who was home comes from separate markup.
//
// A row is only emitted when a real final score is present. A fixture, a TBA row, a tournament placeholder,
// a postponed or cancelled game produces nothing — never a 0-0.

import { parseHTML } from 'linkedom';
import { isNonTeam, normalizeTeamName } from '../waterpolo.config.mjs';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** `W, 16-15 2OT` · `L, 15-16 (2 OT)` · `T, 9-9` — the score is required, the overtime tail is not. */
const RESULT_RE = /\b([WLT])\s*,?\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*(\(?\s*\d?\s*(?:OT|ot)\s*\d?\s*\)?)?/;

/** Words that mean "this is not a final score", checked before we trust any number on the row. */
const NOT_FINAL = /\b(postponed|cancell?ed|ppd|suspended|forfeit|in progress|live|halftime)\b/i;

const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
/**
 * Visible text of an element, with a space between separate nodes.
 *
 * `textContent` concatenates siblings with nothing in between, so "Bruno Classic" followed by an
 * "Exhibition" badge reads as "Bruno ClassicExhibition" and a venue runs into its city. Joining the
 * text nodes keeps words apart. Comment nodes are skipped, which also drops the framework's own
 * `<!--[-->` hydration markers.
 */
function text(el) {
  if (!el) return '';
  const parts = [];
  const walk = (node) => {
    for (const child of node.childNodes ?? []) {
      if (child.nodeType === 3) parts.push(child.textContent);
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
  return clean(parts.join(' '));
}

/** "2 OT" / "(2 OT)" / "2OT" / "OT" → "OT" or "2OT". Normalized so two sources agree. */
export function normalizeOvertime(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d)?\s*OT/i);
  if (!m) return null;
  return m[1] && m[1] !== '1' ? `${m[1]}OT` : 'OT';
}

/**
 * "Aug 29 (Sat) 2 p.m." → { date: '2026-08-29', time: '14:00' }.
 * `seasonStartYear` is the calendar year the season opens in; Jan–Jul roll into the following year.
 */
export function parseGameDate(raw, seasonStartYear) {
  const s = clean(raw);
  const m = s.match(/\b([A-Za-z]{3,5})\.?\s+(\d{1,2})\b/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  const year = month >= 8 ? seasonStartYear : seasonStartYear + 1;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { date, time: parseTime(s) };
}

/**
 * First clock time in the string, as 24-hour "HH:MM". Sites that print two zones
 * ("1 p.m. ET/10 a.m. PT") list Eastern first, which is the one we keep.
 * Returns null when the row carries no time — we never invent one.
 */
export function parseTime(raw) {
  const s = clean(raw);
  const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const pm = /^p/i.test(m[3]);
  if (h === 12) h = 0;
  if (pm) h += 12;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Pull the final score out of a result blob, or null when there isn't one. */
export function parseResult(raw) {
  const s = clean(raw);
  if (!s || NOT_FINAL.test(s)) return null;
  const m = s.match(RESULT_RE);
  if (!m) return null;
  const us = Number(m[2]);
  const them = Number(m[3]);
  if (!Number.isInteger(us) || !Number.isInteger(them)) return null;
  const outcome = m[1].toUpperCase();
  // A W with a lower score (or an L with a higher one) means we misread the row — drop it rather than guess.
  if (outcome === 'W' && us < them) return null;
  if (outcome === 'L' && us > them) return null;
  if (outcome === 'T' && us !== them) return null;
  return { outcome, us, them, ot: normalizeOvertime(m[4]) };
}

function absolute(src, origin) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) return origin + src;
  return null;
}

/** Sidearm's own placeholder logo means "no logo for this opponent". */
const PLACEHOLDER_LOGO = /\/site\.(png|jpg|svg)|responsive_2018\/images\/.*generic/i;

function logoFrom(img, origin) {
  if (!img) return null;
  const raw = img.getAttribute('data-src') || img.getAttribute('src') || '';
  if (!raw || PLACEHOLDER_LOGO.test(raw)) return null;
  return absolute(raw, origin);
}

/**
 * The classic location block holds the city and the facility as separate spans. Joined with plain
 * spaces they read as one run-on string, so join them with a separator instead.
 */
function locationOf(li) {
  const box = li.querySelector('.sidearm-schedule-game-location');
  if (!box) return null;
  const parts = [...box.children].map((el) => text(el)).filter(Boolean);
  const joined = parts.length > 1 ? [...new Set(parts)].join(' \u00b7 ') : text(box);
  return joined || null;
}

/**
 * Both generations mark a non-counting game with a small badge next to the game. Read the badge
 * rather than the whole row, so a tournament or opponent name can never be mistaken for one.
 */
const EXHIBITION_BADGE = '.s-game-card__promotion-btn-text, .sidearm-schedule-game-opponent-promotion, .sidearm-schedule-game-note';

function isExhibition(root) {
  for (const el of root.querySelectorAll(EXHIBITION_BADGE)) {
    if (/exhibition|scrimmage/i.test(text(el))) return true;
  }
  return false;
}

/**
 * A link to the official recap or box score for one game. Sites label these by their text
 * ("Recap", "Box Score"), not by a predictable URL shape, so match the label.
 */
const DETAIL_LABEL = /^(box ?score|recap|stats|final stats|game ?story)$/i;

function detailLinks(root, origin) {
  const out = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const label = clean(a.textContent);
    if (!DETAIL_LABEL.test(label)) continue;
    const href = absolute(a.getAttribute('href'), origin);
    if (href && !out.includes(href)) out.push(href);
  }
  return out;
}

/**
 * Classic Sidearm. One `<li data-game-id>` per game; inside it the same game is repeated as a
 * mobile row and a desktop row, so we read each field once per `<li>` and the copies collapse.
 */
export function parseClassic(html, ctx) {
  const { document } = parseHTML(html);
  const origin = new URL(ctx.url).origin;
  const rows = [];
  const seenGameIds = new Set();

  for (const li of document.querySelectorAll('li.sidearm-schedule-game[data-game-id]')) {
    const gameId = li.getAttribute('data-game-id');
    if (gameId && seenGameIds.has(gameId)) continue; // duplicate markup for the same game
    if (gameId) seenGameIds.add(gameId);

    const result = parseResult(text(li.querySelector('.sidearm-schedule-game-result')));
    if (!result) continue;

    const oppRaw =
      text(li.querySelector('.sidearm-schedule-game-opponent-name a')) ||
      text(li.querySelector('.sidearm-schedule-game-opponent-name'));
    if (!oppRaw || isNonTeam(oppRaw)) continue;

    const when = parseGameDate(text(li.querySelector('.sidearm-schedule-game-opponent-date')), ctx.seasonYear);
    if (!when) continue;

    const cls = li.className || '';
    const neutral = /sidearm-schedule-neutral-game/.test(cls);
    const away = !neutral && /sidearm-schedule-away-game/.test(cls);

    const tournamentEl = li.closest('.sidearm-schedule-tournament');
    const links = detailLinks(li, origin);

    rows.push({
      sourceGameId: gameId || null,
      date: when.date,
      time: when.time,
      opponentRaw: normalizeTeamName(oppRaw),
      us: result.us,
      them: result.them,
      outcome: result.outcome,
      ot: result.ot,
      neutral,
      away,
      exhibition: isExhibition(li),
      venue: locationOf(li),
      tournament: tournamentEl ? text(tournamentEl.querySelector('p')) || null : null,
      opponentLogo: logoFrom(li.querySelector('.sidearm-schedule-game-opponent-logo img'), origin),
      detailUrl: links[0] || null,
    });
  }
  return rows;
}

const NG = (name) => `[data-test-id="s-game-card-standard__${name}"]`;

/** Newer Vue-rendered Sidearm. One card per game, stable `data-test-id` hooks, no game id. */
export function parseNextgen(html, ctx) {
  const { document } = parseHTML(html);
  const origin = new URL(ctx.url).origin;
  const rows = [];

  for (const card of document.querySelectorAll(NG('root'))) {
    const result = parseResult(text(card.querySelector(NG('header-game-team-score'))));
    if (!result) continue;

    const oppRaw = text(card.querySelector(NG('header-team-opponent-link')));
    if (!oppRaw || isNonTeam(oppRaw)) continue;

    const dateText =
      text(card.querySelector(NG('header-game-date-details'))) || text(card.querySelector(NG('header-game-date')));
    const timeText = text(card.querySelector(NG('header-game-time')));
    const when = parseGameDate(dateText || timeText, ctx.seasonYear);
    if (!when) continue;
    const time = when.time ?? parseTime(timeText);

    // The vs/at stamp sits on the opponent logo. First one in the card is this game's.
    const stamp = text(card.querySelector('.s-game-card__header__stamp'));
    const away = /^at$/i.test(stamp);

    const links = detailLinks(card, origin);

    rows.push({
      sourceGameId: null,
      date: when.date,
      time,
      opponentRaw: normalizeTeamName(oppRaw),
      us: result.us,
      them: result.them,
      outcome: result.outcome,
      ot: result.ot,
      // This markup distinguishes home from away but not neutral sites; the merge fills that in
      // when a classic source for the same game knows better.
      neutral: null,
      away,
      exhibition: isExhibition(card),
      venue:
        text(card.querySelector('[data-test-id="s-game-card-facility-and-location__standard-location-details"]')) ||
        null,
      // The tournament chip is a generic "descriptor" pill; it is the only one on a game card.
      tournament: text(card.querySelector('[data-test-id="s-descriptor__text"]')) || null,
      opponentLogo:
        card.querySelector('[data-test-id="s-game-card-opponent-logo__link"] img')?.getAttribute('src') ?? null,
      detailUrl: links[0] || null,
    });
  }
  return rows;
}

/** Dispatch on the registry's `generation`. */
export function parseSchedule(html, ctx) {
  return ctx.generation === 'nextgen' ? parseNextgen(html, ctx) : parseClassic(html, ctx);
}
