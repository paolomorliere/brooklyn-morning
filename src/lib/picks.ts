import type { StockRecap, StockRecapRow } from '@/types';

/**
 * The track record of the stock picks, as Paolo reads it: did following them beat simply owning the
 * market?
 *
 * Everything here is arithmetic on rows the stocks build already measured — total return, bought at
 * the open of the first session after the pick was published, held 21 sessions, costs deducted, and
 * the S&P 500 (SPY) measured over exactly the same sessions with its own costs. Nothing is re-priced
 * in the app, and nothing is estimated.
 *
 * The rules from CLAUDE.md that this file exists to keep:
 *   * Only **finished** positions enter a figure. A position still inside its hold is shown with the
 *     sessions elapsed and the return *so far*, and is counted nowhere else.
 *   * Version 1 and version 2 are never combined. Callers pass one recap at a time.
 *   * Nothing is ranked, scored or forecast here. These are outcomes.
 */

export interface FinishedPick {
  row: StockRecapRow;
  /** The pick's own return after costs, in percent. */
  netPct: number;
  /** SPY's return over the same sessions after its own costs, in percent. */
  spyPct: number;
  /** `netPct − spyPct`: points ahead of (positive) or behind (negative) the market. */
  vsSpy: number;
  /** What $1,000 (`STAKE`) put into this pick made (+) or lost (−), after costs, dividends included. */
  dollars: number;
  /** Whether the pick could be bought and sold on the days its card printed. */
  card: CardFollow;
}

export interface RunningPick {
  row: StockRecapRow;
  /** Sessions held so far; 0 when the first session has not closed yet. */
  day: number;
  of: number;
  netPct: number | null;
  spyPct: number | null;
  vsSpy: number | null;
  /** What $1,000 would be up (+) or down (−) at the last close. Null until its first session has closed. */
  dollars: number | null;
  card: CardFollow;
}

export interface TrackRecord {
  strategyVersion: 1 | 2;
  /** The last close the figures are valued at. */
  asOf: string;
  /** Newest first. */
  finished: FinishedPick[];
  /** Newest first. Includes a pick whose first session has not closed yet, at day 0. */
  running: RunningPick[];
  /** Picks the build could not price. Listed, never counted. */
  unpriced: StockRecapRow[];
  n: number;
  /** Finished picks that ended ahead of the S&P 500 over the same days. */
  beat: number;
  /** Finished picks whose own return was above zero. A different question from `beat`. */
  madeMoney: number;
  meanNet: number | null;
  meanSpy: number | null;
  meanVsSpy: number | null;
  best: FinishedPick | null;
  worst: FinishedPick | null;
  /** One plain sentence: ahead of, behind or level with the market, and by how much. */
  verdict: string;
  /** Why the verdict is early, when it is. Null once the sample is large enough to stand on its own. */
  caution: string | null;
  /**
   * "If I had done what the card said": $1,000 into each pick. Finished and running are two figures and
   * are never added together — a running pick has not been sold, so its number can still change.
   */
  money: {
    finished: { n: number; total: number; made: number; lost: number };
    running: { n: number; total: number; up: number; down: number; waiting: number };
  };
}

/**
 * The stake every money figure assumes. A round number so the answer reads in dollars rather than
 * percent; every figure scales with it.
 */
export const STAKE = 1000;

/**
 * Could the pick be bought and sold on the days its card printed?
 *
 *   * `exact`    — the record buys at the open of the card's buy day and sells at the close of its sell
 *                  day (or, for a running pick, bought on the card's buy day). The money figure *is*
 *                  what following the card would have done.
 *   * `late`     — the card printed a buy day whose open had already passed when it was published.
 *                  That cannot be done, so the record buys at the next open instead (the CLAUDE.md
 *                  rule); the figure is the nearest thing to following the card, and says so.
 *   * `differs`  — the measured days differ from the card's for any other reason. Said, not hidden.
 *   * `no-dates` — the card printed no sell day (version 1), so there is nothing to follow.
 */
export type CardFollow =
  | { kind: 'exact' }
  | { kind: 'late'; publishedAt: string }
  | { kind: 'differs' }
  | { kind: 'no-dates' };

/** New York date and minutes after midnight for an ISO instant. */
function nyClock(iso: string): { date: string; minutes: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function cardFollow(row: StockRecapRow): CardFollow {
  if (!row.cardBuy || !row.cardSell) return { kind: 'no-dates' };
  // Not traded yet: nothing has been measured, so nothing can disagree with the card.
  if (row.status === 'not-entered' && !row.entryDate) return { kind: 'exact' };
  const boughtAsSaid = row.entryDate === row.cardBuy;
  const soldAsSaid = row.status !== 'complete' || row.valueDate === row.cardSell;
  if (boughtAsSaid && soldAsSaid) return { kind: 'exact' };
  if (row.publishedAt) {
    const at = nyClock(row.publishedAt);
    // Published on or after the card's own buy day, once 09:30 New York had passed: that open was gone.
    if (at && (at.date > row.cardBuy || (at.date === row.cardBuy && at.minutes >= 9 * 60 + 30))) {
      return { kind: 'late', publishedAt: row.publishedAt };
    }
  }
  return { kind: 'differs' };
}

/**
 * Below this many finished picks the record carries a caution. Thirty is the conventional rule of thumb
 * for when an average of independent outcomes starts to settle; it is used here as a display threshold,
 * not as a claim that thirty picks prove anything.
 */
export const EARLY_SAMPLE = 30;

/** Within this many points of the S&P 500 the average is called level rather than ahead or behind. */
export const LEVEL_BAND = 0.05;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** SPY's return for a row: published from 2026-11-23, and exactly `netPct − excessSpyPct` before that. */
export function benchmarkPct(r: StockRecapRow): number | null {
  if (isNum(r.spyPct)) return r.spyPct;
  if (isNum(r.netPct) && isNum(r.excessSpyPct)) return r.netPct - r.excessSpyPct;
  return null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** "1.1 points", "0.4 points" — always unsigned; the sentence carries the direction. */
const points = (v: number) => `${Math.abs(v).toFixed(1)} ${Math.abs(v).toFixed(1) === '1.0' ? 'point' : 'points'}`;

/** "+1.7", "−35.5" with a real minus sign. */
export const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export function trackRecord(recap: StockRecap): TrackRecord {
  const finished: FinishedPick[] = [];
  const running: RunningPick[] = [];
  const unpriced: StockRecapRow[] = [];

  for (const row of recap.rows) {
    const spy = benchmarkPct(row);
    if (row.status === 'complete' && isNum(row.netPct) && isNum(spy)) {
      finished.push({
        row,
        netPct: row.netPct,
        spyPct: spy,
        vsSpy: row.netPct - spy,
        dollars: (STAKE * row.netPct) / 100,
        card: cardFollow(row),
      });
    } else if (row.status === 'open' || row.status === 'not-entered') {
      const net = isNum(row.netPct) ? row.netPct : null;
      running.push({
        row,
        day: row.status === 'open' ? (row.sessionsHeld ?? 0) : 0,
        of: row.horizon ?? 21,
        netPct: net,
        spyPct: spy,
        vsSpy: net != null && spy != null ? net - spy : null,
        dollars: net != null && row.status === 'open' ? (STAKE * net) / 100 : null,
        card: cardFollow(row),
      });
    } else {
      // 'unpriced', or a 'complete' row the build could not value against the benchmark. Either way it
      // cannot honestly enter a figure, so it is listed and not counted.
      unpriced.push(row);
    }
  }

  const byDateDesc = <T extends { row: StockRecapRow }>(a: T, b: T) => b.row.date.localeCompare(a.row.date);
  finished.sort(byDateDesc);
  running.sort(byDateDesc);

  const n = finished.length;
  const beat = finished.filter((f) => f.vsSpy > 0).length;
  const madeMoney = finished.filter((f) => f.netPct > 0).length;
  const meanNet = mean(finished.map((f) => f.netPct));
  const meanSpy = mean(finished.map((f) => f.spyPct));
  const meanVsSpy = mean(finished.map((f) => f.vsSpy));
  const best = n ? finished.reduce((a, b) => (b.vsSpy > a.vsSpy ? b : a)) : null;
  const worst = n ? finished.reduce((a, b) => (b.vsSpy < a.vsSpy ? b : a)) : null;

  return {
    strategyVersion: recap.strategyVersion,
    asOf: recap.asOf,
    finished,
    running,
    unpriced,
    n,
    beat,
    madeMoney,
    meanNet,
    meanSpy,
    meanVsSpy,
    best,
    worst,
    verdict: verdictFor(n, meanVsSpy),
    caution: cautionFor(finished, meanVsSpy),
    money: moneyFor(finished, running),
  };
}

function moneyFor(finished: FinishedPick[], running: RunningPick[]): TrackRecord['money'] {
  const priced = running.filter((r): r is RunningPick & { dollars: number } => r.dollars != null);
  return {
    finished: {
      n: finished.length,
      total: finished.reduce((a, f) => a + f.dollars, 0),
      made: finished.filter((f) => f.dollars > 0).length,
      lost: finished.filter((f) => f.dollars < 0).length,
    },
    running: {
      n: priced.length,
      total: priced.reduce((a, r) => a + r.dollars, 0),
      up: priced.filter((r) => r.dollars > 0).length,
      down: priced.filter((r) => r.dollars < 0).length,
      waiting: running.length - priced.length,
    },
  };
}

/** "+$177", "−$1,053", "$0" — whole dollars, a real minus sign, thousands separated. */
export function usd(v: number): string {
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}$${Math.abs(r).toLocaleString('en-US')}`;
}

function verdictFor(n: number, meanVsSpy: number | null): string {
  if (n === 0 || meanVsSpy == null) return 'No pick has finished its holding period yet, so there is no record to judge.';
  const picks = n === 1 ? 'the one finished pick' : `the ${n} finished picks`;
  if (Math.abs(meanVsSpy) < LEVEL_BAND) return `So far the picks are level with the market: on average ${picks} did the same as the S&P 500 over the same days.`;
  return meanVsSpy > 0
    ? `So far the picks are ahead of the market: on average ${picks} ended ${points(meanVsSpy)} above the S&P 500 over the same days.`
    : `So far the picks are behind the market: on average ${picks} ended ${points(meanVsSpy)} below the S&P 500 over the same days.`;
}

/**
 * Why the verdict is early. Two things are said only when they are true:
 *   * the sample is small, and
 *   * a single pick decides which side of the market the average falls on — measured by taking out the
 *     pick furthest from the market and checking whether the sign flips. Both figures are shown, so this
 *     can never be read as quietly dropping a bad result.
 */
function cautionFor(finished: FinishedPick[], meanVsSpy: number | null): string | null {
  const n = finished.length;
  if (n === 0 || meanVsSpy == null || n >= EARLY_SAMPLE) return null;
  const parts = [`${n} finished ${n === 1 ? 'pick is' : 'picks is'} a small sample, so treat this as early.`];
  if (n >= 3) {
    const extreme = finished.reduce((a, b) => (Math.abs(b.vsSpy) > Math.abs(a.vsSpy) ? b : a));
    const without = (meanVsSpy * n - extreme.vsSpy) / (n - 1);
    const flips = Math.abs(without) >= LEVEL_BAND && Math.sign(without) !== Math.sign(meanVsSpy);
    if (flips) {
      parts.push(
        `One pick decides the direction: without ${extreme.row.ticker} (${signed(extreme.vsSpy)} points against the S&P 500) the average would be ${signed(without)} points instead of ${signed(meanVsSpy)}.`,
      );
    }
  }
  return parts.join(' ');
}

/**
 * The one line the daily card shows: the reasons in a pick's thesis, without its preamble.
 *
 * `thesisFor` in build-stocks.mjs writes every thesis as "Ranked first among today's eligible
 * candidates on <signals> — <reasons>." The reasons are the part a reader wants first, so the card
 * shows them verbatim, capitalised, and the full sentence stays under "Why this stock". A thesis in any
 * other shape — the no-standout wording, or a future change to the generator — is shown whole rather
 * than guessed at.
 */
export function thesisLine(thesis: string): string {
  const i = thesis.indexOf(' — ');
  if (!thesis.startsWith('Ranked first') || i < 0) return thesis;
  const reasons = thesis.slice(i + 3).trim();
  return reasons ? reasons.charAt(0).toUpperCase() + reasons.slice(1) : thesis;
}
