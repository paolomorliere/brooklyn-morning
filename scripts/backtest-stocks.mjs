// Measure the strategy on the history the free data covers — and say, loudly, how little that is.
//
// Usage: node scripts/backtest-stocks.mjs [options]
//   --development          run on the development window only (the default)
//   --open-held-out        run on the held-out window. Allowed once, under one set of rules.
//   --quiet                do not write STATUS.md
//
// **What this can and cannot establish.** The free price plan gives about two years of history. After
// the 253-session burn-in the formulas need, that leaves roughly 250 decision days, which is about
// **twelve non-overlapping 21-session blocks**. Twelve observations cannot establish an edge. They can
// rule out a rule that is obviously broken, and they can show whether the fundamental screens change
// anything. That is the whole claim.
//
// **Three biases that cannot be removed here, only disclosed.**
//   * *Survivorship.* The universe comes from Nasdaq Trader's list of what is traded *now*. A company
//     delisted last year is absent, so the backtest never buys one. This flatters the result and there
//     is no free source of historical listings to fix it with.
//   * *The quiet window is a proxy.* Live, a candidate is set aside if an 8-K carrying item 2.02 was
//     accepted in the last two sessions. Historically that would need a filing index per company per
//     day, which is not cached, so the backtest uses the 10-Q/10-K acceptance date instead. That is
//     later than the announcement for most companies, so the backtest sometimes buys a stock the live
//     rule would have skipped.
//   * *Fundamentals reach back twelve quarters.* Decisions early in the window see fewer filings than
//     decisions late in it, so the eligible set grows through the test.
//
// **The held-out window is opened once.** The rules are a committed file with a hash; the first time
// this script is allowed to touch the held-out window it records that hash and the date. Opening it
// again under different rules is refused, because a held-out window you can reopen is a development
// window with a longer name.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { readDigest, sicByCik } from './lib/sec.mjs';
import { readBars, seriesByTicker } from './lib/prices.mjs';
import { adjustedDividends, trailingReturn } from './lib/signals.mjs';
import { sicMajorGroup } from './lib/fundamentals.mjs';
import {
  HORIZON_SESSIONS,
  STOCK_COST_BPS,
  BENCHMARK_COST_BPS,
  calendarFrom,
  maxDrawdown,
  neweyWestTStat,
  positionReturn,
  tStatistic,
} from './lib/portfolio.mjs';
import { LIMITS, applyVolatilityCap, decide, peerPercentiles, screenCandidate } from './lib/select.mjs';
import { loadStrategy } from './lib/strategy.mjs';
import { tapeSymbol } from './lib/universe.mjs';
import { UNIVERSE as V1_UNIVERSE, metricsFor, pickStock } from './lib/stocks.mjs';

const args = process.argv.slice(2);
const OPEN_HELD_OUT = args.includes('--open-held-out');
const QUIET = args.includes('--quiet');
const BENCHMARKS = ['SPY', 'RSP'];
/** The development window is the older share of the decision days; the rest is held out. */
const DEVELOPMENT_SHARE = 0.6;
const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ loading */

class NoHistory extends Error {}

async function loadEverything() {
  const universe = JSON.parse(await readFile('state/universe.json', 'utf8'));
  const subs = [];
  const facts = [];
  for (const f of (await readdir('state/sec')).filter((n) => n.endsWith('.csv.gz')).sort()) {
    const d = await readDigest(`state/sec/${f}`);
    if (!d) continue;
    for (const s of d.subs) subs.push(s);
    for (const x of d.facts) facts.push(x);
  }
  const dates = [];
  let years;
  try {
    years = await readdir('state/bars');
  } catch {
    throw new NoHistory('state/bars holds no sessions yet.');
  }
  for (const year of years.sort()) {
    for (const f of (await readdir(`state/bars/${year}`)).sort()) {
      const m = /^(\d{4}-\d{2}-\d{2})\.csv\.gz$/.exec(f);
      if (m) dates.push(m[1]);
    }
  }
  dates.sort();
  const loaded = [];
  for (const date of dates) {
    const rows = await readBars(date);
    if (rows) loaded.push({ date, rows });
  }
  const wanted = new Set([...universe.symbols.map(tapeSymbol), ...BENCHMARKS, ...V1_UNIVERSE.map(([t]) => tapeSymbol(t))]);
  const series = seriesByTicker(loaded, { tickers: wanted });
  const actions = JSON.parse(await readFile('state/corporate-actions.json', 'utf8'));
  const splitsBy = new Map();
  for (const s of actions.splits ?? []) {
    if (!splitsBy.has(s.ticker)) splitsBy.set(s.ticker, []);
    splitsBy.get(s.ticker).push(s);
  }
  const divsBy = new Map();
  for (const d of actions.dividends ?? []) {
    if (!divsBy.has(d.ticker)) divsBy.set(d.ticker, []);
    divsBy.get(d.ticker).push(d);
  }
  const dividendCache = new Map();
  const dividendsFor = (ticker) => {
    const t = tapeSymbol(ticker);
    if (!dividendCache.has(t)) dividendCache.set(t, adjustedDividends(divsBy.get(t) ?? [], splitsBy.get(t) ?? []));
    return dividendCache.get(t);
  };
  const factsByCik = new Map();
  for (const f of facts) {
    const l = factsByCik.get(f.cik);
    if (l) l.push(f);
    else factsByCik.set(f.cik, [f]);
  }
  const subsByCik = new Map();
  for (const s of subs) {
    const l = subsByCik.get(s.cik);
    if (l) l.push(s);
    else subsByCik.set(s.cik, [s]);
  }
  return {
    universe,
    series,
    calendar: calendarFrom(loaded.map((s) => ({ date: s.date }))),
    dividendsFor,
    factsByCik,
    subsByCik,
    sicMap: sicByCik(subs),
  };
}

/* ------------------------------------------------------------------ one decision day */

/**
 * Everything one decision session needs, sliced to what was knowable at it.
 *
 * `bars.slice(0, i + 1)` is the whole point: a candidate on day `i` sees the sessions up to `i` and not
 * one more. The fundamentals are filtered the same way, by acceptance timestamp, inside `screenCandidate`.
 */
function candidatesAt(ctx, T, { priceOnly = false } = {}) {
  const { universe, series, dividendsFor, factsByCik, subsByCik, sicMap, calendar } = ctx;
  const tIndex = calendar.indexOf(T);
  const out = [];
  for (const ticker of universe.symbols) {
    const tape = tapeSymbol(ticker);
    const all = series.get(tape);
    if (!all) continue;
    let end = -1;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].date === T) {
        end = i;
        break;
      }
      if (all[i].date < T) break;
    }
    if (end < 0) continue;
    const bars = all.slice(0, end + 1);
    if (bars.length < LIMITS.minSessions) continue;
    const cik = universe.cik[ticker];
    if (!cik) continue;
    const key = String(Number(cik));
    out.push({
      ticker,
      name: universe.names[ticker] ?? ticker,
      cik: key,
      sic: sicMap.get(key) ?? '',
      bars,
      dividends: dividendsFor(ticker),
      // The price-only baseline is the direct test of whether the financial screens earn their keep: it
      // runs the identical price machinery with no fundamentals at all.
      facts: priceOnly ? [] : (factsByCik.get(key) ?? []),
      submissions: priceOnly ? [] : (subsByCik.get(key) ?? []),
      announcements: [],
      earningsEstimate: null,
    });
  }
  const spyBars = sliceTo(series.get('SPY'), T);
  return {
    candidates: out,
    tIndex,
    spy: { return126: spyBars ? trailingReturn(spyBars, 126, dividendsFor('SPY')) : null },
  };
}

function sliceTo(bars, T) {
  if (!bars) return null;
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].date === T) return bars.slice(0, i + 1);
  return null;
}

/** Median 126-session return per SIC major group, for the relative-strength signal. */
function sectorReturnsAt(candidates, dividendsFor) {
  const byMajor = new Map();
  for (const c of candidates) {
    const major = sicMajorGroup(c.sic);
    if (!major) continue;
    const r = trailingReturn(c.bars, 126, dividendsFor(c.ticker));
    if (r == null) continue;
    if (!byMajor.has(major)) byMajor.set(major, []);
    byMajor.get(major).push(r);
  }
  const out = {};
  for (const [major, rs] of byMajor) {
    rs.sort((a, b) => a - b);
    out[major] = rs[rs.length >> 1];
  }
  return out;
}

/** A seeded choice, so "random eligible pick" is a reproducible baseline and not a different one each run. */
function seededPick(rows, seed) {
  if (rows.length === 0) return null;
  const x = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return rows[Math.abs(x) % rows.length];
}

/* ------------------------------------------------------------------ the run */

/**
 * Walk the decision sessions, choosing one position a session for each strategy under test.
 *
 * The strategies share the walk, so every one of them sees exactly the same universe, the same bars and
 * the same eligible set on the same day. Any difference in the result is a difference in the rule.
 */
async function runWindow(ctx, sessions, { include }) {
  const picks = { composite: [], priceOnly: [], random: [], v1: [] };
  const openBy = { composite: [], priceOnly: [], random: [], v1: [] };
  /** Every eligible candidate's five-session return and what it went on to earn. See `decileTable`. */
  const samples = [];
  let done = 0;
  for (const T of sessions) {
    const { candidates, spy } = candidatesAt(ctx, T);
    const sectorReturns = sectorReturnsAt(candidates, ctx.dividendsFor);

    for (const [name, priceOnly] of [['composite', false], ['priceOnly', true]]) {
      const pool = priceOnly ? candidates.map((c) => ({ ...c, facts: [], submissions: [] })) : candidates;
      const base = { T, asOf: T, calendar: ctx.calendar, spy, sectorReturns, openPositions: openBy[name] };
      const screened = pool.map((c) => screenCandidate(c, base));
      const rows = peerPercentiles(applyVolatilityCap(screened).rows);
      const outcome = decide(rows, { include, T, scanned: ctx.universe.symbols.length });
      record(picks[name], openBy[name], outcome.pick, T, ctx);
      if (name === 'composite') {
        const eligible = rows.filter((r) => r.eligible);
        record(picks.random, openBy.random, seededPick(eligible, sessions.indexOf(T) + 1), T, ctx);
        collectFiveDaySample(samples, eligible, T, ctx);
      }
    }

    // Version 1's rule, run over version 1's own 104 names with the current bars, so the comparison is
    // between rules rather than between data sources.
    const v1Rows = V1_UNIVERSE.map(([ticker, name]) => {
      const bars = sliceTo(ctx.series.get(tapeSymbol(ticker)), T);
      return { ticker, name, m: bars ? metricsFor(bars) : null };
    });
    const recent = new Set(picks.v1.slice(-10).map((p) => p.ticker));
    const v1 = pickStock(v1Rows, { recent });
    record(picks.v1, openBy.v1, v1 ? { ticker: v1.ticker, name: v1.name, division: 'n/a' } : null, T, ctx);

    done++;
    if (done % 10 === 0) log(`  ${done}/${sessions.length} sessions (${T})`);
  }
  return { picks, samples };
}

/**
 * For every eligible candidate: its five-session return at the decision, and the excess return it went
 * on to earn over the next 21 sessions against SPY.
 *
 * This is the whole sample the reversal hypothesis is tested on — the eligible set, not just the
 * positions the rule happened to take, which would be a few hundred observations of a rule that already
 * prefers particular stocks.
 */
function collectFiveDaySample(samples, eligible, T, ctx) {
  const i = ctx.calendar.indexOf(T);
  const entry = ctx.calendar[i + 1];
  const exit = ctx.calendar[i + HORIZON_SESSIONS];
  if (!entry || !exit) return;
  const spy = ctx.series.get('SPY');
  const bench = spy
    ? positionReturn({ bars: spy, dividends: ctx.dividendsFor('SPY'), entryDate: entry, valueDate: exit, costBps: BENCHMARK_COST_BPS })
    : null;
  if (!bench) return;
  for (const r of eligible) {
    const r5 = r.metrics?.return5;
    if (!Number.isFinite(r5)) continue;
    const bars = ctx.series.get(tapeSymbol(r.ticker));
    const got = positionReturn({ bars, dividends: ctx.dividendsFor(r.ticker), entryDate: entry, valueDate: exit });
    if (!got) continue;
    samples.push({ r5, excess: got.net - bench.net });
  }
}

function record(into, open, pick, T, ctx) {
  if (!pick) {
    into.push({ date: T, ticker: null, name: null, division: null, skipped: true });
    prune(open, T, ctx);
    return;
  }
  into.push({ date: T, ticker: pick.ticker, name: pick.name ?? pick.ticker, division: pick.division ?? null, skipped: false });
  open.push({ ticker: pick.ticker, division: pick.division ?? 'Unclassified', entryIndex: ctx.calendar.indexOf(T) });
  prune(open, T, ctx);
}

function prune(open, T, ctx) {
  const i = ctx.calendar.indexOf(T);
  for (let k = open.length - 1; k >= 0; k--) if (i - open[k].entryIndex + 1 >= HORIZON_SESSIONS) open.splice(k, 1);
}

/* ------------------------------------------------------------------ measurement */

/**
 * Twenty-one slots of equal capital, each compounding its own sequence of positions.
 *
 * This is what "achievable with a fixed sum" means concretely. Slot `k` holds the positions entered on
 * sessions k, k+21, k+42 and so on; nothing is reused, nothing is borrowed, and cash between positions
 * earns nothing. The portfolio's return is the average of the twenty-one slots' compounded returns.
 */
function measure(picks, ctx, { costBps = STOCK_COST_BPS } = {}) {
  const { calendar, series, dividendsFor } = ctx;
  const positions = [];
  for (const p of picks) {
    if (p.skipped) continue;
    const i = calendar.indexOf(p.date);
    const entry = calendar[i + 1];
    const exit = calendar[i + HORIZON_SESSIONS];
    if (!entry || !exit) continue;
    const bars = series.get(tapeSymbol(p.ticker));
    const r = positionReturn({ bars, dividends: dividendsFor(p.ticker), entryDate: entry, valueDate: exit, costBps });
    if (!r) continue;
    positions.push({ ...p, ...r, entryIndex: i + 1, exitIndex: i + HORIZON_SESSIONS });
  }
  if (positions.length === 0) return null;

  const slots = Array.from({ length: HORIZON_SESSIONS }, () => 1);
  for (const pos of positions) slots[pos.entryIndex % HORIZON_SESSIONS] *= 1 + pos.net;
  const portfolio = slots.reduce((a, b) => a + b, 0) / HORIZON_SESSIONS - 1;

  const nets = positions.map((p) => p.net);
  const gains = nets.filter((v) => v > 0);
  const losses = nets.filter((v) => v <= 0);
  const divisions = new Map();
  for (const p of positions) divisions.set(p.division ?? 'Unclassified', (divisions.get(p.division ?? 'Unclassified') ?? 0) + 1);
  const top = [...divisions.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    positions,
    n: positions.length,
    skipped: picks.filter((p) => p.skipped).length,
    portfolio,
    meanNet: nets.reduce((a, b) => a + b, 0) / nets.length,
    winRate: gains.length / nets.length,
    averageGain: gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null,
    averageLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null,
    // Turnover is one position in and one out per session by construction; what varies is how often the
    // rule declined to pick at all.
    turnover: positions.length / Math.max(1, picks.length),
    concentration: top ? { division: top[0], share: top[1] / positions.length } : null,
    uniqueNames: new Set(positions.map((p) => p.ticker)).size,
  };
}

/** Buy and hold the benchmark over the same sessions, with the benchmark's own cost. */
function benchmarkOver(ctx, sessions, ticker) {
  const bars = ctx.series.get(ticker);
  if (!bars || sessions.length < 2) return null;
  const i = ctx.calendar.indexOf(sessions[0]);
  const entry = ctx.calendar[i + 1];
  const exit = sessions[sessions.length - 1];
  if (!entry) return null;
  return positionReturn({ bars, dividends: ctx.dividendsFor(ticker), entryDate: entry, valueDate: exit, costBps: BENCHMARK_COST_BPS });
}

/**
 * The headline: non-overlapping 21-session blocks.
 *
 * Every position entered inside a block is closed before the next block's positions open, so the block
 * returns are as close to independent observations as this design allows. About twelve of them exist,
 * and twelve is the number that makes every conclusion provisional.
 */
function blockStatistics(measured, ctx, sessions) {
  const first = ctx.calendar.indexOf(sessions[0]);
  const blocks = new Map();
  for (const pos of measured.positions) {
    const b = Math.floor((pos.entryIndex - first) / HORIZON_SESSIONS);
    if (!blocks.has(b)) blocks.set(b, []);
    blocks.get(b).push(pos);
  }
  const rows = [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, list]) => {
      const mean = list.reduce((a, p) => a + p.net, 0) / list.length;
      const spy = list.map((p) => benchmarkPosition(ctx, p, 'SPY')).filter((v) => v != null);
      const rsp = list.map((p) => benchmarkPosition(ctx, p, 'RSP')).filter((v) => v != null);
      return {
        block: b,
        n: list.length,
        from: ctx.calendar[first + b * HORIZON_SESSIONS],
        net: mean,
        excessSpy: spy.length ? mean - spy.reduce((a, b2) => a + b2, 0) / spy.length : null,
        excessRsp: rsp.length ? mean - rsp.reduce((a, b2) => a + b2, 0) / rsp.length : null,
      };
    });
  const excess = rows.map((r) => r.excessSpy).filter((v) => v != null);
  const equity = [];
  let cum = 1;
  for (const r of rows) equity.push((cum *= 1 + r.net));
  return {
    blocks: rows,
    n: rows.length,
    meanExcessSpy: excess.length ? excess.reduce((a, b) => a + b, 0) / excess.length : null,
    tStat: tStatistic(excess),
    neweyWest: neweyWestTStat(measured.positions.map((p) => p.net), HORIZON_SESSIONS),
    maxDrawdown: maxDrawdown(equity),
  };
}

/** The same window in the benchmark, matched position by position, so the comparison is like for like. */
function benchmarkPosition(ctx, pos, ticker) {
  const bars = ctx.series.get(ticker);
  if (!bars) return null;
  const r = positionReturn({
    bars,
    dividends: ctx.dividendsFor(ticker),
    entryDate: ctx.calendar[pos.entryIndex],
    valueDate: ctx.calendar[pos.exitIndex],
    costBps: BENCHMARK_COST_BPS,
  });
  return r ? r.net : null;
}

/* ------------------------------------------------------------------ reporting */

const pc = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);
const num = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));

function report(name, measured, blocks) {
  if (!measured) return `| ${name} | no positions | | | | | | |`;
  return [
    `| ${name}`,
    pc(measured.portfolio),
    pc(measured.meanNet),
    pc(blocks.meanExcessSpy),
    `${Math.round(measured.winRate * 100)}%`,
    pc(measured.averageGain),
    pc(measured.averageLoss),
    pc(blocks.maxDrawdown),
    `${measured.n}`,
    `${measured.uniqueNames}`,
    measured.concentration ? `${Math.round(measured.concentration.share * 100)}% ${measured.concentration.division}` : '—',
    `${num(blocks.tStat)} / ${num(blocks.neweyWest)} |`,
  ].join(' | ');
}

async function main() {
  const { rules, hash } = await loadStrategy();
  const ctx = await loadEverything();
  const decisionDays = ctx.calendar.slice(LIMITS.minSessions - 1, ctx.calendar.length - HORIZON_SESSIONS);
  if (decisionDays.length < HORIZON_SESSIONS * 2) {
    log(`Not enough history: ${ctx.calendar.length} sessions cached gives ${decisionDays.length} decision days. Backfill the price cache first.`);
    return;
  }
  const split = Math.floor(decisionDays.length * DEVELOPMENT_SHARE);
  const development = decisionDays.slice(0, split);
  const heldOut = decisionDays.slice(split);

  const ledgerPath = 'state/held-out-opened.json';
  let ledger = null;
  try {
    ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch {
    /* never opened */
  }
  if (OPEN_HELD_OUT) {
    if (ledger && ledger.strategyHash !== hash) {
      log(`Refused. The held-out window was opened on ${ledger.openedAt} under rules ${ledger.strategyHash}, and the rules are now ${hash}.`);
      log('A held-out window you can reopen under new rules is a development window with a longer name.');
      log('To make a genuine second test, extend the price history and hold out the new sessions.');
      process.exitCode = 1;
      return;
    }
  }

  const windows = OPEN_HELD_OUT ? [['development', development], ['held out', heldOut]] : [['development', development]];
  const results = {};
  for (const [label, sessions] of windows) {
    log(`\n${label}: ${sessions.length} decision days, ${sessions[0]} to ${sessions[sessions.length - 1]}`);
    const { picks, samples } = await runWindow(ctx, sessions, { include: rules.ranking.candidateSignalsAdopted });
    const entry = { sessions: sessions.length, from: sessions[0], to: sessions[sessions.length - 1], strategies: {} };
    for (const [name, list] of Object.entries(picks)) {
      const measured = measure(list, ctx);
      entry.strategies[name] = measured
        ? { summary: { ...measured, positions: undefined }, blocks: blockStatistics(measured, ctx, sessions) }
        : null;
    }
    if (label === 'development') entry.fiveDayDeciles = decileTable(samples);
    for (const b of BENCHMARKS) {
      const r = benchmarkOver(ctx, sessions, b);
      entry[`buyAndHold${b}`] = r ? r.net : null;
    }
    results[label] = entry;
  }

  const out = {
    builtAt: new Date().toISOString(),
    strategyHash: hash,
    horizonSessions: HORIZON_SESSIONS,
    sessionsCached: ctx.calendar.length,
    decisionDays: decisionDays.length,
    development: { from: development[0], to: development[development.length - 1], n: development.length },
    heldOut: { from: heldOut[0], to: heldOut[heldOut.length - 1], n: heldOut.length, opened: OPEN_HELD_OUT },
    results,
    fiveDayDeciles: results.development?.fiveDayDeciles ?? null,
    limitations: [
      'The universe is the list of securities traded today, so no delisted company is ever bought. The result is biased upward and there is no free source of historical listings to correct it.',
      'The quiet window uses the 10-Q or 10-K acceptance date, not the 8-K item 2.02 announcement, because a historical filing index per company per day is not cached.',
      'Fundamentals come from twelve quarters of data sets, so decisions early in the window see fewer filings than decisions late in it.',
      `About ${Math.floor(decisionDays.length / HORIZON_SESSIONS)} non-overlapping blocks exist. That cannot establish an edge, and no claim of one is made.`,
    ],
  };
  await writeFile('state/backtest-v2.json', JSON.stringify(out, null, 1));
  log('\nwrote state/backtest-v2.json');

  if (OPEN_HELD_OUT && !ledger) {
    await writeFile(
      ledgerPath,
      JSON.stringify({ openedAt: new Date().toISOString(), strategyHash: hash, heldOut: out.heldOut }, null, 1),
    );
    log(`wrote ${ledgerPath} — the held-out window is now opened, once, under rules ${hash}`);
  }

  log(markdown(out));
  if (!QUIET) await appendToStatus(markdown(out));
}

/**
 * Is a five-session return anything? Measured, not assumed.
 *
 * Short-term reversal is a hypothesis here, not a diagnosis — six observations of the old rule
 * established nothing either way. This is the test: mean forward 21-session excess return by decile of
 * the five-session return, over the whole eligible set on the development window. **The top decile is
 * not pre-excluded**; if it earns less, the table will say so. If the table is flat, which is the likely
 * outcome at this sample size, the five-session return stays out of the score and survives only as the
 * card's note about an overextended entry.
 *
 * The observations overlap heavily — thousands of them share the same 21 sessions — so the spread within
 * a decile is reported but no significance is claimed from it.
 */
function decileTable(samples) {
  if (!samples || samples.length < 100) return null;
  const sorted = [...samples].sort((a, b) => a.r5 - b.r5);
  const size = Math.floor(sorted.length / 10);
  const rows = [];
  for (let d = 0; d < 10; d++) {
    const slice = sorted.slice(d * size, d === 9 ? sorted.length : (d + 1) * size);
    if (slice.length === 0) continue;
    const mean = slice.reduce((a, s) => a + s.excess, 0) / slice.length;
    rows.push({
      decile: d + 1,
      n: slice.length,
      r5From: slice[0].r5,
      r5To: slice[slice.length - 1].r5,
      meanExcess: mean,
    });
  }
  const top = rows[rows.length - 1];
  const rest = rows.slice(0, -1);
  const restMean = rest.length ? rest.reduce((a, r) => a + r.meanExcess * r.n, 0) / rest.reduce((a, r) => a + r.n, 0) : null;
  return {
    rows,
    observations: samples.length,
    topDecileMinusRest: top && restMean != null ? top.meanExcess - restMean : null,
    note: 'Observations overlap heavily — thousands share the same 21 sessions — so the differences are descriptive and no significance is claimed from them. A flat table means the five-session return stays out of the score.',
  };
}

function markdown(out) {
  const lines = [];
  lines.push(`### Backtest — strategy ${out.strategyHash}, run ${out.builtAt.slice(0, 10)}`);
  lines.push('');
  lines.push(`${out.sessionsCached} sessions cached · ${out.decisionDays} decision days · development ${out.development.from} to ${out.development.to} (${out.development.n}) · held out ${out.heldOut.from} to ${out.heldOut.to} (${out.heldOut.n}, ${out.heldOut.opened ? 'opened' : 'not opened'})`);
  for (const [label, entry] of Object.entries(out.results)) {
    lines.push('');
    lines.push(`**${label}** — ${entry.from} to ${entry.to}, ${entry.sessions} decision days. Buy and hold: SPY ${pc(entry.buyAndHoldSPY)}, RSP ${pc(entry.buyAndHoldRSP)}.`);
    lines.push('');
    lines.push('| strategy | portfolio | mean position | mean excess vs SPY | win rate | avg gain | avg loss | max drawdown | n | names | top division | t / Newey-West |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [name, r] of Object.entries(entry.strategies)) {
      lines.push(r ? report(name, r.summary, r.blocks) : `| ${name} | no positions | | | | | | | | | | |`);
    }
  }
  for (const l of decileMarkdown(out.fiveDayDeciles)) lines.push(l);
  lines.push('');
  lines.push('**Limitations**');
  for (const l of out.limitations) lines.push(`- ${l}`);
  return lines.join('\n');
}

async function appendToStatus(md) {
  const path = 'STATUS.md';
  let text = '';
  try {
    text = await readFile(path, 'utf8');
  } catch {
    /* new file */
  }
  const marker = '<!-- backtest -->';
  const block = `${marker}\n${md}\n${marker}`;
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(marker);
  const next = start >= 0 && end > start ? `${text.slice(0, start)}${block}${text.slice(end + marker.length)}` : `${text.trimEnd()}\n\n## Backtest\n\n${block}\n`;
  await writeFile(path, next);
  log(`updated ${path}`);
}

/** The five-day decile table, rendered. */
function decileMarkdown(d) {
  if (!d) return ['', '_The five-session-return decile table needs at least 100 observations; there are not that many yet._'];
  const lines = ['', '**Forward 21-session excess return by five-session-return decile** — the reversal hypothesis, tested rather than assumed.', '', '| decile | five-session return | n | mean excess vs SPY |', '|---|---|---|---|'];
  for (const r of d.rows) lines.push(`| ${r.decile} | ${pc(r.r5From)} to ${pc(r.r5To)} | ${r.n.toLocaleString('en-US')} | ${pc(r.meanExcess)} |`);
  lines.push('');
  lines.push(`Top decile less the rest: **${pc(d.topDecileMinusRest)}** over ${d.observations.toLocaleString('en-US')} overlapping observations. ${d.note}`);
  return lines;
}

main().catch((err) => {
  if (err instanceof NoHistory) {
    console.error(`${err.message}`);
    console.error('The backtest needs the price cache. Set MASSIVE_API_KEY and run:');
    console.error('  node scripts/build-stocks.mjs --backfill 520');
    console.error('Nothing has been written.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
