// Execution and measurement: when a pick is actually bought, when it is sold, and what it earned.
//
// The old recap averaged five positions held 5, 4, 3, 2 and 1 sessions and printed one number. That
// is not a return — it is five different experiments averaged as if they were comparable, and it is
// the single biggest reason the published −2.85% said nothing. Everything here exists to stop that
// happening again:
//
//   * **A position starts at the open of the first session that begins after publication.** Never at
//     a price that existed before the pick did. The card's own price is the last close before
//     publication and is a different field, so the two can never be confused.
//   * **The entry session is day 1 of 21.** The exit is the close of session 21, counted off the
//     trading calendar, so a market holiday inside the window lengthens it in calendar days and
//     leaves it unchanged in sessions.
//   * **The headline figure uses completed positions only.** A position still open is reported as
//     open, with the sessions elapsed, and contributes nothing to the average.
//   * **Costs are explicit**: 10 basis points each way on the stock, 2 on the benchmark. Gross and net
//     are both reported, so the cost assumption is visible rather than buried.

import { dividendsBetween } from './signals.mjs';

/** Sessions held. One month of trading. */
export const HORIZON_SESSIONS = 21;

/** Round-trip costs, in basis points each way. */
export const STOCK_COST_BPS = 10;
export const BENCHMARK_COST_BPS = 2;

/** The market opens at 09:30 in New York. Published before that, and the day's open is still ahead. */
const OPEN_MINUTES = 9 * 60 + 30;

/**
 * An instant in New York: the calendar date there and the minutes past midnight.
 *
 * The season lives on the US market calendar, so a pick published at 02:00 UTC belongs to the
 * previous New York day and must not be treated as the next one.
 */
export function nyParts(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = {};
  for (const p of f.formatToParts(new Date(t))) if (p.type !== 'literal') parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

/**
 * The trading calendar, taken from the dates the price feed actually published.
 *
 * No holiday table is maintained anywhere in this project. The exchange decides which days it
 * traded, the grouped-bar dates record that decision, and deriving the calendar from them means it
 * can never drift out of date. SPY's history is the reference series because it has a bar on every
 * session the market was open.
 */
export function calendarFrom(bars) {
  const dates = [...new Set((bars ?? []).map((b) => b.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  dates.sort();
  return dates;
}

/**
 * The next `n` probable sessions after the calendar ends — weekdays, and nothing cleverer.
 *
 * A pick is published before the market opens, so the session it will be bought in has not happened
 * and has no bar, which means the real calendar cannot name it. This projects it. Weekends are the only
 * thing it knows about; a public holiday inside the projection shifts every later date by one session.
 * That is why the card calls the exit approximate and why nothing is ever *measured* against a
 * projection: `measurePick` recomputes the entry and the exit from the real calendar once the sessions
 * have actually traded.
 */
export function projectSessions(calendar, n) {
  const last = calendar.length ? calendar[calendar.length - 1] : null;
  if (!last) return [];
  const out = [];
  let t = Date.parse(`${last}T00:00:00Z`);
  while (out.length < n) {
    t += 86_400_000;
    const d = new Date(t);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The index of `date` in the calendar, or the index of the first session after it, or −1. */
export function sessionIndexAtOrAfter(calendar, date) {
  for (let i = 0; i < calendar.length; i++) if (calendar[i] >= date) return i;
  return -1;
}

/** The index of `date`, or of the last session before it, or −1. */
export function sessionIndexAtOrBefore(calendar, date) {
  for (let i = calendar.length - 1; i >= 0; i--) if (calendar[i] <= date) return i;
  return -1;
}

/**
 * The session a pick published at `publishedAt` is bought in.
 *
 * Published before 09:30 on a trading day, the buy is that day's open. Published at any later hour,
 * or on a day the market is shut, it is the next session's open. Returns null when the calendar does
 * not reach that far — an honest "not known yet" rather than a guessed date.
 */
export function entrySession(calendar, publishedAt) {
  const ny = nyParts(publishedAt);
  if (!ny) return null;
  const sameDay = calendar.indexOf(ny.date);
  if (sameDay >= 0 && ny.minutes < OPEN_MINUTES) return calendar[sameDay];
  const next = sessionIndexAtOrAfter(calendar, ny.date);
  if (next < 0) return null;
  // `next` may be the publication day itself, which has already opened by now.
  const i = calendar[next] === ny.date ? next + 1 : next;
  return i < calendar.length ? calendar[i] : null;
}

/**
 * The session a position closes in: the entry session counts as day 1, so a 21-session hold exits 20
 * sessions later. Null when the calendar has not reached that session yet.
 */
export function exitSession(calendar, entryDate, horizon = HORIZON_SESSIONS) {
  const i = calendar.indexOf(entryDate);
  if (i < 0) return null;
  const j = i + horizon - 1;
  return j < calendar.length ? calendar[j] : null;
}

/** Sessions elapsed from the entry session through `asOf`, counting the entry session as 1. */
export function sessionsHeld(calendar, entryDate, asOf) {
  const i = calendar.indexOf(entryDate);
  if (i < 0) return 0;
  const j = sessionIndexAtOrBefore(calendar, asOf);
  if (j < i) return 0;
  return j - i + 1;
}

/** The bar on an exact date, or null. Positions are priced on named sessions, never approximated. */
function barOn(bars, date) {
  for (const b of bars ?? []) if (b.date === date) return b;
  return null;
}

/**
 * What one position earned, bought at the open of `entryDate` and valued at the close of `valueDate`.
 *
 * Gross is the investor's total return before costs; net applies `costBps` on the way in and the same
 * on the way out. Dividends count when they went ex after the entry session, because buying on the
 * ex-date does not entitle the buyer to that payment.
 */
export function positionReturn({ bars, dividends = [], entryDate, valueDate, costBps = STOCK_COST_BPS }) {
  const entry = barOn(bars, entryDate);
  const value = barOn(bars, valueDate);
  if (!entry || !value || !(entry.open > 0) || !(value.close > 0)) return null;
  const cash = dividendsBetween(dividends, entryDate, valueDate).reduce((a, d) => a + d.amount, 0);
  const c = costBps / 10_000;
  const gross = (value.close + cash) / entry.open - 1;
  const net = (value.close * (1 - c) + cash) / (entry.open * (1 + c)) - 1;
  return {
    entryDate,
    valueDate,
    entryPrice: entry.open,
    valuePrice: value.close,
    dividends: cash,
    gross,
    net,
    costBps,
  };
}

/**
 * One pick, measured. `complete` is the only thing the headline average looks at.
 *
 * `horizon` sessions are counted on the calendar, so the window is the same length in trading days
 * whatever holidays fall inside it.
 */
export function measurePick(pick, { calendar, bars, dividends = [], benchmarks = {}, asOf, horizon = HORIZON_SESSIONS }) {
  const entryDate = pick.entryDate ?? entrySession(calendar, pick.publishedAt);
  if (!entryDate) return { ...pick, status: 'not-entered', reason: 'the market has not opened since publication' };
  const plannedExit = exitSession(calendar, entryDate, horizon);
  const held = sessionsHeld(calendar, entryDate, asOf);
  const complete = plannedExit != null && plannedExit <= asOf;
  const valueDate = complete ? plannedExit : calendar[sessionIndexAtOrBefore(calendar, asOf)];
  if (!valueDate) return { ...pick, entryDate, status: 'not-entered', reason: 'no session priced yet' };
  const position = positionReturn({ bars, dividends, entryDate, valueDate });
  if (!position) return { ...pick, entryDate, status: 'unpriced', reason: `no bar for ${entryDate} or ${valueDate}` };
  const marks = {};
  for (const [name, series] of Object.entries(benchmarks)) {
    marks[name] = positionReturn({
      bars: series.bars,
      dividends: series.dividends ?? [],
      entryDate,
      valueDate,
      costBps: BENCHMARK_COST_BPS,
    });
  }
  return {
    ...pick,
    status: complete ? 'complete' : 'open',
    entryDate,
    plannedExit,
    valueDate,
    sessionsHeld: Math.min(held, horizon),
    horizon,
    complete,
    ...position,
    benchmarks: marks,
    excess: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v ? position.net - v.net : null])),
  };
}

/** Student's t for a mean against zero. Supporting evidence only — the sample is far too small. */
export function tStatistic(values) {
  const n = values.length;
  if (n < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  if (!sd) return null;
  return m / (sd / Math.sqrt(n));
}

/**
 * A t-statistic that does not assume the observations are independent.
 *
 * They are not. A pick is made every session and held twenty-one, so twenty of any two consecutive
 * days' positions overlap, and the ordinary standard error of the mean is far too small — it would turn
 * an inconclusive result into a confident one purely by counting correlated observations as fresh
 * evidence. Newey and West's estimator widens the error by the autocovariance out to `lag`, weighted so
 * the result cannot go negative (Bartlett weights).
 *
 * This is reported as *supporting* evidence only. The headline statistic comes from non-overlapping
 * blocks, where independence is a property of the design rather than an adjustment after the fact.
 */
export function neweyWestTStat(values, lag = HORIZON_SESSIONS) {
  const n = values.length;
  if (n < 3) return null;
  const m = values.reduce((a, b) => a + b, 0) / n;
  const e = values.map((v) => v - m);
  const gamma = (j) => {
    let sum = 0;
    for (let t = j; t < n; t++) sum += e[t] * e[t - j];
    return sum / n;
  };
  const g0 = gamma(0);
  if (!(g0 > 0)) return null;
  const L = Math.min(lag, n - 1);
  let s = g0;
  for (let j = 1; j <= L; j++) s += 2 * (1 - j / (L + 1)) * gamma(j);
  // A Bartlett-weighted sum is non-negative in theory; floating point can still land on zero or a
  // whisker below it, and reporting an imaginary standard error would be worse than reporting nothing.
  if (!(s > 0)) return null;
  return m / Math.sqrt(s / n);
}

/** The worst peak-to-trough fall in a sequence of cumulative values. */
export function maxDrawdown(equity) {
  let peak = -Infinity;
  let worst = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

/**
 * The recap.
 *
 * Completed positions produce the headline; open ones are listed with their elapsed sessions and
 * excluded from every average. `mixedHorizonMean` exists only to reproduce the v1 record, which did
 * average unequal holding periods — it is reported under that name, next to the number of distinct
 * horizons it spans, so the figure can never again be read as a return.
 */
export function summarise(rows, { benchmark = 'SPY' } = {}) {
  const complete = rows.filter((r) => r.status === 'complete');
  const open = rows.filter((r) => r.status === 'open');
  const nets = complete.map((r) => r.net);
  const excess = complete.map((r) => r.excess?.[benchmark]).filter((v) => typeof v === 'number');
  const gains = nets.filter((v) => v > 0);
  const losses = nets.filter((v) => v <= 0);
  const horizons = new Set(rows.filter((r) => r.sessionsHeld > 0).map((r) => r.sessionsHeld));
  const avg = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  return {
    n: complete.length,
    open: open.length,
    meanNet: avg(nets),
    meanGross: avg(complete.map((r) => r.gross)),
    meanExcess: avg(excess),
    benchmark,
    wins: gains.length,
    winRate: complete.length ? gains.length / complete.length : null,
    averageGain: avg(gains),
    averageLoss: avg(losses),
    sd: nets.length > 1 ? Math.sqrt(nets.reduce((a, b) => a + (b - avg(nets)) ** 2, 0) / (nets.length - 1)) : null,
    tStat: tStatistic(excess),
    mixedHorizonMean: avg(rows.filter((r) => typeof r.net === 'number').map((r) => r.net)),
    mixedHorizonCount: horizons.size,
    horizonsSpanned: [...horizons].sort((a, b) => a - b),
  };
}
