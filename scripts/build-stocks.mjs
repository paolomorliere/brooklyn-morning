// Build today's "Stock in Focus" — one position per session, held 21 sessions.
//
// Usage: node scripts/build-stocks.mjs [options]
//   --dry-run              compute and report, write nothing
//   --date YYYY-MM-DD      pretend today is this date (the edition date the card is for)
//   --backfill N           fetch up to N missing sessions of bars instead of just the recent ones
//   --sec-quarters N       how many quarterly data sets to keep in the digest (default 5)
//   --max-companyfacts N   per-run cap on near-end fundamentals top-ups (default 300)
//   --max-submissions N    per-run cap on the exact earnings check (default 12)
//   --check                make one price request, report what came back, and stop
//   --no-prices            skip the price feed, for working on the SEC side without a key
//   --sec-only             build only the fundamentals caches and report, then stop
//
// Writes public/data/stock.json, state/stocks-v2.json, and the caches under state/.
//
// **This runs on its own schedule, not the edition's.** The morning edition used to fetch 104 stock
// quotes inline, which put a flaky third-party feed on the critical path of a build that has to finish
// before 6 AM, and meant a permanently broken feed produced green builds forever. Now the edition reads
// whatever this published and says plainly when that is not today's.
//
// **The request budget, and why each number is what it is.** Everything here is free and stays free:
//   * Massive, free plan, five requests a minute: one grouped-bars call covers every US ticker for one
//     session, so a day costs one call and a two-year backfill costs about 500. Splits and dividends are
//     fetched market-wide, weekly — per-ticker calls for 5,000 names would take sixteen hours.
//   * SEC, ten requests a second, declared contact: one 60 MB quarterly data set per quarter; one daily
//     index per session, which says exactly who filed so the near-end top-up is precise rather than
//     speculative; `companyfacts` only for those filers; and `submissions` only for the handful of
//     candidates at the top of the ranking, where the exact earnings test actually changes the answer.
//
// If the free allowance is ever exhausted the run stops and publishes nothing. It never republishes
// yesterday's pick as today's, and it never reaches for a paid plan.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import {
  addDays,
  allTags,
  daysBetween,
  latestFinancialFiling,
  sectorGroupOf,
  sicDivision,
  sicMajorGroup,
} from './lib/fundamentals.mjs';
import {
  earningsAnnouncements,
  earningsRiskInWindow,
  estimateNextEarnings,
  parseSubmissionIndex,
} from './lib/earnings.mjs';
import {
  AllowanceExhausted,
  KeyRejected,
  OutsideEntitlement,
  RateLimiter,
  earliestAvailableSession,
  fetchDividends,
  fetchGroupedBars,
  fetchSplits,
  readBars,
  seriesByTicker,
  writeBars,
} from './lib/prices.mjs';
import {
  decodeDigest,
  encodeDigest,
  factsFromCompanyFacts,
  fetchCompanyTickers,
  fetchDailyIndex,
  fetchNasdaqTraded,
  fetchQuarterDigest,
  fetchSubmissionIndex,
  mergeFacts,
  padCik,
  quartersBack,
  readDigest,
  secGet,
  secUserAgent,
  sicByCik,
  submissionsFromFacts,
  writeDigest,
} from './lib/sec.mjs';
import { adjustedDividends, trailingReturn } from './lib/signals.mjs';
import {
  HORIZON_SESSIONS,
  calendarFrom,
  exitSession,
  measurePick,
  projectSessions,
  sessionIndexAtOrBefore,
  summarise,
} from './lib/portfolio.mjs';
import {
  LIMITS,
  applyVolatilityCap,
  decide,
  peerPercentiles,
  screenCandidate,
} from './lib/select.mjs';
import { loadStrategy, ruleText, validationNote } from './lib/strategy.mjs';
import { buildUniverse, parseCompanyTickers, parseNasdaqTraded, tapeSymbol } from './lib/universe.mjs';

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const val = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const DRY = has('--dry-run');
const NO_PRICES = has('--no-prices');
const SEC_ONLY = has('--sec-only');
/** Make one price request, report exactly what came back, and stop. */
const CHECK_ONLY = has('--check');
const TZ = 'America/New_York';
const TODAY = val('--date', new Date().toLocaleDateString('en-CA', { timeZone: TZ }));
const BACKFILL = Number(val('--backfill', 0));
/**
 * How many quarterly data sets the digest keeps.
 *
 * Twelve, because the signals need eight consecutive single quarters and a data set only contains the
 * filings accepted in its own quarter. Each 10-Q carries its quarter and the year-ago comparative, and
 * cash-flow figures are reported year-to-date only — so a standalone quarterly cash flow has to be
 * derived from two year-to-date points that may sit in different filings. Measured on three quarters of
 * digests, only 2.6% of the universe had a complete eight-quarter revenue series; twelve quarters is
 * what makes the set analysable. The cost is about 15 MB committed and a one-off 700 MB of downloads.
 */
const SEC_QUARTERS = Number(val('--sec-quarters', 12));
const MAX_COMPANYFACTS = Number(val('--max-companyfacts', 300));
const MAX_SUBMISSIONS = Number(val('--max-submissions', 12));

/** How much price history to load. 260 gives the 253 the formulas need, with slack. */
const HISTORY_SESSIONS = 300;
const BENCHMARKS = ['SPY', 'RSP'];
const TAGS = allTags();

/** A missing secret is a setup problem, not a bug: it gets a readable message, not a stack trace. */
class SetupError extends Error {}

const log = (...a) => console.log(...a);
const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = async (path, value) => {
  if (DRY) return;
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 1));
};
const daysSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity);

/* ------------------------------------------------------------------ the universe */

/**
 * The tradable universe, refreshed weekly.
 *
 * The census of exclusions is kept, not just the result. A universe that quietly halves is a bug
 * nobody notices, and "5,051 of 13,289 rows, of which 5,758 were funds" is checkable in a way that
 * "5,051 symbols" is not.
 */
async function ensureUniverse() {
  const cached = await readJson('state/universe.json', null);
  if (cached && daysSince(cached.fetchedAt) < 7) return cached;
  log('universe: fetching nasdaqtraded.txt and the SEC ticker map');
  const { rows, createdAt } = parseNasdaqTraded(await fetchNasdaqTraded());
  const built = buildUniverse(rows);
  const tickers = parseCompanyTickers(await fetchCompanyTickers());
  const cik = {};
  let resolved = 0;
  for (const s of built.symbols) {
    const hit = tickers[s] ?? tickers[s.replace(/-/g, '.')];
    if (hit) {
      cik[s] = hit.cik;
      resolved++;
    }
  }
  const out = { fetchedAt: new Date().toISOString(), createdAt, ...built, cik, resolved };
  await writeJson('state/universe.json', out);
  log(`universe: ${built.symbols.length} of ${built.total} rows eligible, ${resolved} resolved to a CIK`);
  for (const [reason, n] of Object.entries(built.byReason).sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(6)} ${reason}`);
  return out;
}

/* ------------------------------------------------------------------ prices */

/** The sessions that might have traded between the last cached one and today, newest last. */
function candidateSessions(from, to, limit) {
  const out = [];
  let t = Date.parse(`${from}T00:00:00Z`) + 86_400_000;
  const end = Date.parse(`${to}T00:00:00Z`);
  while (t <= end && out.length < limit) {
    const d = new Date(t);
    const day = d.getUTCDay();
    // Weekends are never sessions, and asking about them would spend the allowance to be told so.
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

/**
 * One request, to find out whether the key works, before spending two hours discovering that it does not.
 *
 * The most recent weekday is certainly inside the plan's two-year window, so anything other than a
 * success here is about the key or the plan, not about the date. A 200 with no rows is still a success:
 * it just means the session has not closed yet.
 */
async function checkConnection(apiKey) {
  let probe = TODAY;
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.parse(`${probe}T00:00:00Z`)).getUTCDay();
    if (day !== 0 && day !== 6) break;
    probe = addDays(probe, -1);
  }
  const got = await fetchGroupedBars(probe, { apiKey, limiter: new RateLimiter() });
  log(`prices: the key works — ${probe} returned ${got.rows.length} rows${got.traded ? '' : ' (the session has not closed yet)'}`);
  return got;
}

/** Every session already cached, oldest first. */
async function cachedSessionDates(root = 'state/bars') {
  const out = [];
  let years;
  try {
    years = await readdir(root);
  } catch {
    return out;
  }
  for (const year of years.sort()) {
    let files;
    try {
      files = await readdir(`${root}/${year}`);
    } catch {
      continue;
    }
    for (const f of files.sort()) {
      const m = /^(\d{4}-\d{2}-\d{2})\.csv\.gz$/.exec(f);
      if (m) out.push(m[1]);
    }
  }
  return out.sort();
}

/**
 * Fetch whichever sessions are missing, and cache each one in its own file.
 *
 * Append-only on purpose: a file written once and never rewritten means git stores one small object per
 * trading day rather than a fresh copy of the whole history, and if the free plan ever ends the history
 * already committed is still there.
 */
async function ensurePrices(apiKey, { limit }) {
  const cached = await cachedSessionDates();
  // The free plan serves two years. Where the backfill starts is computed from that, not written down:
  // the boundary moves every day, and a date one week past it is refused in a way that looks exactly
  // like every other refusal. The first version of this asked for 2024-10-01 — four days outside the
  // window — and the whole run died on its first request.
  const floor = earliestAvailableSession(TODAY);
  const last = cached.length ? cached[cached.length - 1] : null;
  const from = last && last >= floor ? last : addDays(floor, -1);
  const wanted = candidateSessions(from, TODAY, limit);
  if (wanted.length > 5) await checkConnection(apiKey);
  if (!cached.length && limit < LIMITS.minSessions) {
    log(`prices: nothing cached yet, and only ${limit} sessions would be fetched. Run this workflow once with`);
    log(`prices: backfill set to about ${LIMITS.minSessions + 270} to fill the history the formulas need.`);
  }
  if (wanted.length === 0) return { cached, fetched: 0, closedDays: [] };
  const limiter = new RateLimiter();
  let fetched = 0;
  let refused = 0;
  const closedDays = [];
  log(`prices: ${cached.length} sessions cached, ${wanted.length} to try (${wanted[0]} … ${wanted[wanted.length - 1]}); the plan reaches back to ${floor}`);
  for (const date of wanted) {
    let got;
    try {
      got = await fetchGroupedBars(date, { apiKey, limiter });
    } catch (err) {
      if (err instanceof OutsideEntitlement) {
        // One session the plan will not serve. Skip it rather than abandoning the run — but if the
        // oldest several in a row are refused, the window has moved and there is no point reaching
        // further back.
        refused++;
        log(`prices: ${date} is outside the plan's history — skipped`);
        if (refused >= 5 && fetched === 0) {
          log('prices: the five oldest sessions were all refused, so the backfill starts later than expected.');
          continue;
        }
        continue;
      }
      throw err;
    }
    refused = 0;
    if (!got.traded || got.rows.length === 0) {
      closedDays.push(date);
      continue;
    }
    if (!DRY) await writeBars(date, got.rows);
    cached.push(date);
    fetched++;
    if (fetched % 25 === 0) log(`prices: ${fetched} sessions fetched (${date})`);
  }
  cached.sort();
  log(`prices: ${fetched} new sessions, ${closedDays.length} days the market was shut`);
  return { cached, fetched, closedDays };
}

/** Splits and dividends, market-wide and weekly. Per-ticker calls are not affordable at five a minute. */
async function ensureActions(apiKey, since) {
  const cached = await readJson('state/corporate-actions.json', null);
  if (cached && daysSince(cached.fetchedAt) < 7 && cached.since <= since) return cached;
  log('actions: fetching splits and dividends');
  const limiter = new RateLimiter();
  const splits = await fetchSplits(since, { apiKey, limiter });
  const dividends = await fetchDividends(since, { apiKey, limiter });
  const out = { fetchedAt: new Date().toISOString(), since, splits, dividends };
  await writeJson('state/corporate-actions.json', out);
  log(`actions: ${splits.length} splits, ${dividends.length} dividends since ${since}`);
  return out;
}

/* ------------------------------------------------------------------ fundamentals */

/** The quarterly data sets, one 60 MB download per quarter, kept as a few megabytes each. */
async function ensureDigest() {
  const quarters = quartersBack(SEC_QUARTERS, TODAY);
  const subs = [];
  const facts = [];
  for (const quarter of quarters) {
    const path = `state/sec/${quarter.year}q${quarter.q}.csv.gz`;
    let digest = await readDigest(path);
    if (!digest) {
      try {
        log(`fundamentals: downloading ${quarter.year}Q${quarter.q}`);
        const got = await fetchQuarterDigest(quarter, { tags: TAGS });
        if (!DRY) await writeDigest(path, got);
        digest = decodeDigest(encodeDigest(got));
        log(`fundamentals: ${quarter.year}Q${quarter.q} — ${got.subs.length} filings, ${got.facts.length} facts from ${(got.zipBytes / 1e6).toFixed(0)} MB`);
      } catch (err) {
        // A quarter that has not been published yet is normal: the sets appear a month or two after the
        // quarter closes. Anything else is worth saying out loud but is not fatal.
        log(`fundamentals: ${quarter.year}Q${quarter.q} unavailable — ${err.message}`);
        continue;
      }
    }
    // A loop, not a spread. `push(...array)` passes every element as a separate argument, and a
    // quarter holds nearly two hundred thousand facts — far past the engine's argument limit.
    for (const s of digest.subs) subs.push(s);
    for (const f of digest.facts) facts.push(f);
  }
  return { subs, facts, quarters };
}

/**
 * The near end: fundamentals filed since the newest quarterly data set.
 *
 * A data set appears a month or two after its quarter closes, so the most recent filings are in none of
 * them. The daily index names exactly who filed, so `companyfacts` is fetched for those companies and
 * nobody else. `companyfacts` publishes a filing date but no acceptance time, so acceptance is taken as
 * the end of the filing day — later than the truth, which is the only direction that cannot leak a
 * figure backwards into a decision that preceded it.
 */
async function ensureOverlay(universe, sessions) {
  const metaPath = 'state/sec/overlay.meta.json';
  const meta = await readJson(metaPath, { cursor: null, fetchedAt: {} });
  const existing = (await readDigest('state/sec/overlay.csv.gz')) ?? { subs: [], facts: [] };
  const byCikTicker = new Map();
  for (const [ticker, cik] of Object.entries(universe.cik)) if (!byCikTicker.has(cik)) byCikTicker.set(cik, ticker);
  const ours = new Set([...byCikTicker.keys()].map((c) => String(Number(c))));

  const from = meta.cursor ?? sessions[Math.max(0, sessions.length - 70)];
  const days = sessions.filter((d) => d > from);
  const queue = new Map();
  for (const date of days) {
    const rows = await fetchDailyIndex(date);
    if (!rows) continue;
    for (const r of rows) if (ours.has(r.cik)) queue.set(r.cik, r.filed ?? date);
  }
  log(`fundamentals: ${queue.size} companies in the universe filed a 10-Q or 10-K across ${days.length} sessions`);

  const sic = sicByCik(existing.subs);
  let done = 0;
  const subs = [...existing.subs];
  const facts = [...existing.facts];
  const have = new Set(existing.facts.map((f) => `${f.adsh}|${f.tag}|${f.ddate}|${f.qtrs}|${f.uom}`));
  for (const [cik, filed] of [...queue.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1))) {
    if (done >= MAX_COMPANYFACTS) {
      log(`fundamentals: stopping at the ${MAX_COMPANYFACTS}-company cap; the rest are picked up on the next run`);
      break;
    }
    try {
      const json = await secGet(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`);
      const got = factsFromCompanyFacts(json, { tags: TAGS, cik });
      const fresh = got.filter((f) => !have.has(`${f.adsh}|${f.tag}|${f.ddate}|${f.qtrs}|${f.uom}`));
      for (const f of fresh) have.add(`${f.adsh}|${f.tag}|${f.ddate}|${f.qtrs}|${f.uom}`);
      for (const f of fresh) facts.push(f);
      for (const sub of submissionsFromFacts(fresh, { sic: sic.get(String(Number(cik))) ?? '' })) subs.push(sub);
      meta.fetchedAt[cik] = new Date().toISOString();
    } catch (err) {
      log(`fundamentals: CIK ${cik} — ${err.message}`);
    }
    done++;
  }

  // Keep the overlay from growing without bound: anything older than the digest's reach is already in a
  // quarterly data set, with a real acceptance timestamp, and the digest wins on a duplicate anyway.
  const horizon = quartersBack(SEC_QUARTERS + 1, TODAY)[0];
  const keepFrom = `${horizon.year}-${String(horizon.q * 3 - 2).padStart(2, '0')}-01`;
  const keptSubs = subs.filter((s) => (s.period ?? '9999') >= keepFrom);
  const keptAdsh = new Set(keptSubs.map((s) => s.adsh));
  const keptFacts = facts.filter((f) => keptAdsh.has(f.adsh));
  if (!DRY) {
    await writeDigest('state/sec/overlay.csv.gz', { subs: keptSubs, facts: keptFacts });
    await writeJson(metaPath, { ...meta, cursor: days.length ? days[days.length - 1] : meta.cursor });
  }
  log(`fundamentals: overlay holds ${keptFacts.length} facts from ${keptSubs.length} filings`);
  return decodeDigest(encodeDigest({ subs: keptSubs, facts: keptFacts }));
}

/* ------------------------------------------------------------------ the card */

const pctText = (v, digits = 1) => (v == null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);
const plainPct = (v, digits = 1) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`);
const moneyText = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const m = v / 1e6;
  return Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(1)}bn` : `$${Math.round(m).toLocaleString('en-US')}M`;
};
const timesText = (v) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(2)}×`);

/** The evidence table: figures off filings, each with the period it covers and the day it was filed. */
function evidenceFor(row) {
  const g = row.figures;
  const period = `4 qtrs to ${row.periodEnd}`;
  const filed = row.filing?.filed ?? null;
  const out = [
    { label: 'Revenue, trailing year', value: `${moneyText(g.revenueTtm)}, ${pctText(g.revenueGrowth)}`, period, filed, tag: row.tags.revenue },
    {
      label: 'Quarterly revenue, year on year',
      value: `${pctText(g.quarterYoY)}, against ${pctText(g.quarterYoYPrior)} the quarter before`,
      period: `quarter to ${row.periodEnd}`,
      filed,
      tag: row.tags.revenue,
    },
  ];
  if (g.grossMargin != null) {
    out.push({
      label: 'Gross margin, trailing year',
      value: g.grossMarginPrior != null ? `${plainPct(g.grossMargin)}, from ${plainPct(g.grossMarginPrior)}` : plainPct(g.grossMargin),
      period,
      filed,
      tag: row.tags.grossProfit,
    });
  }
  if (g.operatingMargin != null) {
    out.push({
      label: 'Operating margin, trailing year',
      value: g.operatingMarginPrior != null ? `${plainPct(g.operatingMargin)}, from ${plainPct(g.operatingMarginPrior)}` : plainPct(g.operatingMargin),
      period,
      filed,
      tag: row.tags.operatingIncome,
    });
  }
  if (g.cashConversion != null) {
    out.push({ label: 'Cash conversion (cash flow ÷ earnings)', value: timesText(g.cashConversion), period, filed, tag: row.tags.operatingCashFlow });
  }
  if (g.freeCashFlowTtm != null) {
    out.push({
      label: 'Free cash flow, trailing year',
      value: `${moneyText(g.freeCashFlowTtm)}${g.revenueTtm ? ` (${plainPct(g.freeCashFlowTtm / g.revenueTtm)} of revenue)` : ''}`,
      period,
      filed,
      tag: `${row.tags.operatingCashFlow} − ${row.tags.capex}`,
    });
  }
  if (g.leverage != null) {
    out.push({
      label: 'Debt ÷ trailing operating cash flow',
      value: `${timesText(g.leverage)}${g.netLeverage != null ? ` (net ${timesText(g.netLeverage)})` : ''}`,
      period: g.balanceSheetAsOf ? `at ${g.balanceSheetAsOf}` : period,
      filed,
      tag: row.tags.debt,
    });
  }
  if (g.returnOnEquity != null) {
    out.push({ label: 'Return on equity, trailing year', value: plainPct(g.returnOnEquity), period, filed, tag: row.tags.equity });
  }
  if (g.equityToAssets != null) {
    out.push({ label: 'Equity ÷ assets', value: plainPct(g.equityToAssets), period: g.balanceSheetAsOf ? `at ${g.balanceSheetAsOf}` : period, filed, tag: row.tags.equity });
  }
  // Below this line the figures involve a market price, so they are not statements from a filing.
  if (g.earningsYield != null || g.fcfYield != null) {
    out.push({
      label: 'Earnings yield / free cash flow yield',
      value: `${plainPct(g.earningsYield)} / ${plainPct(g.fcfYield)}`,
      period: 'trailing year against the reference close',
      filed: null,
      interpretation: true,
    });
  }
  if (g.shares != null) {
    out.push({
      label: 'Share count',
      value: `${g.shares.toLocaleString('en-US')} (market cap ${moneyText(g.marketCap)})`,
      period: g.sharesAsOf ? `at ${g.sharesAsOf}` : null,
      filed,
      tag: row.tags.shares,
    });
  }
  return out;
}

/** One sentence on what carried the decision, built from the signals that actually scored highest. */
function thesisFor(row) {
  const top = [...row.contributions].sort((a, b) => b.z - a.z).slice(0, 3).filter((c) => c.z > 0);
  if (top.length === 0) return 'This candidate ranked first on the balance of its signals, none of which stood out on its own.';
  const names = top.map((c) => c.label.toLowerCase());
  const g = row.figures;
  const detail = [];
  if (g.revenueGrowth != null) detail.push(`revenue ${pctText(g.revenueGrowth)} over the trailing year`);
  if (g.growthAcceleration != null && g.growthAcceleration > 0) detail.push('growth accelerating against the previous quarter');
  if (g.operatingMarginTrend != null && g.operatingMarginTrend > 0) detail.push('operating margin wider than a year ago');
  if (g.cashConversion != null && g.cashConversion >= 1) detail.push('earnings fully backed by cash');
  return `Ranked first among today's eligible candidates on ${names.join(', ')}${detail.length ? ` — ${detail.join(', ')}` : ''}.`;
}

/** The strongest case against, stated as plainly as the case for. */
function counterargumentFor(row) {
  const g = row.figures;
  const parts = [];
  if (g.earningsYield != null && g.earningsYield > 0 && g.earningsYield < 0.03) {
    parts.push(`it is an expensive stock: ${(1 / g.earningsYield).toFixed(1)}× trailing earnings and a ${plainPct(g.fcfYield)} free cash flow yield, so the growth is already in the price and one weak quarter would cost a lot`);
  } else if (g.earningsYield != null && g.earningsYield <= 0) {
    parts.push('it is not profitable on a trailing-year basis, so there is no earnings yield to defend the price');
  }
  if (g.grossProfitability != null && g.grossProfitability < 0.15) {
    parts.push(`gross profit is only ${g.grossProfitability.toFixed(3)} of total assets, which a generic quality screen would mark down — often because an acquisition left goodwill on the balance sheet rather than because of how the business operates`);
  }
  if (g.leverage != null && g.leverage > 3) {
    parts.push(`debt is ${timesText(g.leverage)} trailing operating cash flow, which leaves less room if conditions turn`);
  }
  if (row.stretched) parts.push(row.stretchedNote);
  if (g.growthAcceleration != null && g.growthAcceleration < 0) parts.push('growth decelerated against the previous quarter, so the trend in the numbers is already turning');
  if (parts.length === 0) {
    parts.push('the honest counterargument is the sample: this process has not been shown to work, and a single ranking position is not evidence about one company');
  }
  return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `. ${parts.slice(1).join('. ')}` : ''}.`;
}

/** The conditions that would show the thesis was wrong — written from this company's own figures. */
function invalidationFor(row) {
  const g = row.figures;
  const out = [];
  if (g.quarterYoYPrior != null) out.push(`Quarterly revenue growth falling below ${pctText(g.quarterYoYPrior)}, the rate it was running at the quarter before.`);
  if (g.grossMargin != null) out.push(`Gross margin falling back below ${plainPct(g.grossMargin - 0.02)}.`);
  if (g.cashConversion != null) out.push('Cash conversion dropping below 1.0×, meaning earnings stop being backed by cash.');
  if (row.metrics?.sma200 != null) out.push(`A close below the 200-session average, which stood at $${row.metrics.sma200.toFixed(2)} on the decision date.`);
  return out;
}

/** Risks that are facts about the data rather than about the company. */
function risksFor(row, { digestHorizon }) {
  const g = row.figures;
  const out = [];
  if (g.sharesAsOf && row.metrics?.asOf) {
    const lag = daysBetween(g.sharesAsOf, row.metrics.asOf);
    if (lag > 30) out.push(`The share count is from ${g.sharesAsOf}, ${lag} days older than the price, so the market capitalisation carries that staleness.`);
  }
  if (row.filing?.period && row.metrics?.asOf) {
    const lag = daysBetween(row.filing.period, row.metrics.asOf);
    out.push(`The most recent filing covers a period ending ${row.filing.period}, ${lag} days before the decision date.`);
  }
  if (row.provenance?.derivedQuarters) {
    out.push('One of the four quarters in the trailing year is the fourth quarter, which companies report only as part of the full year; it is derived as the annual figure less the first three quarters.');
  }
  if (digestHorizon) out.push(`Point-in-time fundamentals are built from filings accepted up to ${digestHorizon.slice(0, 10)}.`);
  return out;
}

/* ------------------------------------------------------------------ the recap */

function recapFor(picks, { strategyVersion, calendar, series, dividendsFor, benchmarks, asOf, horizon, note }) {
  const rows = picks.map((p) => {
    const bars = series.get(tapeSymbol(p.ticker)) ?? [];
    const measured = measurePick(
      { ...p, publishedAt: p.publishedAt ?? `${p.date}T10:00:00.000Z` },
      { calendar, bars, dividends: dividendsFor(p.ticker), benchmarks, asOf, horizon },
    );
    return {
      strategyVersion,
      date: p.date,
      ticker: p.ticker,
      name: p.name,
      status: measured.status,
      reason: measured.reason ?? null,
      entryDate: measured.entryDate ?? null,
      entryPrice: measured.entryPrice ?? null,
      valueDate: measured.valueDate ?? null,
      valuePrice: measured.valuePrice ?? null,
      sessionsHeld: measured.sessionsHeld ?? 0,
      horizon: measured.horizon ?? horizon,
      netPct: measured.net == null ? null : measured.net * 100,
      grossPct: measured.gross == null ? null : measured.gross * 100,
      excessSpyPct: measured.excess?.SPY == null ? null : measured.excess.SPY * 100,
      excessRspPct: measured.excess?.RSP == null ? null : measured.excess.RSP * 100,
      _measured: measured,
    };
  });
  const spy = summarise(rows.map((r) => r._measured), { benchmark: 'SPY' });
  const rsp = summarise(rows.map((r) => r._measured), { benchmark: 'RSP' });
  for (const r of rows) delete r._measured;
  return {
    kind: 'recap',
    strategyVersion,
    asOf,
    rows,
    completed: spy.n,
    open: spy.open,
    meanNetPct: spy.meanNet == null ? null : spy.meanNet * 100,
    meanExcessSpyPct: spy.meanExcess == null ? null : spy.meanExcess * 100,
    meanExcessRspPct: rsp.meanExcess == null ? null : rsp.meanExcess * 100,
    winRate: spy.winRate,
    mixedHorizonMeanPct: spy.mixedHorizonMean == null ? null : spy.mixedHorizonMean * 100,
    horizonsSpanned: spy.horizonsSpanned,
    note,
  };
}

/* ------------------------------------------------------------------ main */

async function main() {
  const { rules, hash } = await loadStrategy();
  const rule = ruleText(rules);
  const validation = validationNote(rules);
  const sources = rules.sources;
  const unavailable = (reason, extra = {}) => ({ kind: 'unavailable', reason, rule, strategyVersion: 2, ...extra });

  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey && !NO_PRICES && !SEC_ONLY) throw new SetupError('MASSIVE_API_KEY is not set.');
  // Checked here rather than at the first request. A quarterly data set that fails to download is a
  // normal, recoverable event — the set may simply not be published yet — so that path catches and
  // carries on. A missing contact would be caught by the same handler and the run would finish green on
  // stale fundamentals, which is precisely the failure this project refuses to have.
  secUserAgent();

  if (CHECK_ONLY) {
    await checkConnection(apiKey);
    log('--check: the price key and the SEC contact are both accepted. Nothing else was done.');
    return;
  }

  const universe = await ensureUniverse();

  if (SEC_ONLY) {
    // The SEC side needs no price key, so it can be built and checked on its own. Useful when setting
    // the project up, and the only way to exercise this half before the price key exists.
    const digest = await ensureDigest();
    const recent = candidateSessions(
      new Date(Date.parse(`${TODAY}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10),
      TODAY,
      14,
    );
    const overlay = await ensureOverlay(universe, recent);
    const merged = mergeFacts(digest.facts, overlay.facts);
    const companies = new Set(merged.map((f) => f.cik));
    log(`--sec-only: ${merged.length} facts for ${companies.size} companies; nothing else was built`);
    return;
  }

  let sessions;
  if (NO_PRICES) {
    sessions = await cachedSessionDates();
    log(`prices: skipped, using the ${sessions.length} sessions already cached`);
  } else {
    ({ cached: sessions } = await ensurePrices(apiKey, { limit: BACKFILL > 0 ? BACKFILL : 10 }));
  }

  const log2 = await readJson('state/stocks-v2.json', { strategyVersion: 2, picks: [] });
  const log1 = await readJson('state/stocks.json', { picks: [] });

  if (sessions.length < LIMITS.minSessions) {
    const reason = `The price history holds ${sessions.length} sessions, and ${LIMITS.minSessions} are needed before any candidate can be measured. Run with --backfill to fill it in.`;
    log(`stock: ${reason}`);
    await publish(unavailable(reason), { hash, recaps: [] });
    return;
  }

  const window = sessions.slice(-HISTORY_SESSIONS);
  const loaded = [];
  for (const date of window) {
    const rows = await readBars(date);
    if (rows) loaded.push({ date, rows });
  }
  const wanted = new Set([...universe.symbols.map(tapeSymbol), ...BENCHMARKS]);
  const series = seriesByTicker(loaded, { tickers: wanted });
  const calendar = calendarFrom(loaded.map((s) => ({ date: s.date })));
  const T = calendar[calendar.length - 1];
  log(`stock: decision session ${T}, ${calendar.length} sessions loaded, ${series.size} tickers with bars`);

  const actions = NO_PRICES
    ? ((await readJson('state/corporate-actions.json', null)) ?? { splits: [], dividends: [] })
    : await ensureActions(apiKey, calendar[0]);
  const splitsBy = new Map();
  for (const s of actions.splits) {
    if (!splitsBy.has(s.ticker)) splitsBy.set(s.ticker, []);
    splitsBy.get(s.ticker).push(s);
  }
  const divsBy = new Map();
  for (const d of actions.dividends) {
    if (!divsBy.has(d.ticker)) divsBy.set(d.ticker, []);
    divsBy.get(d.ticker).push(d);
  }
  const dividendsFor = (ticker) => {
    const t = tapeSymbol(ticker);
    return adjustedDividends(divsBy.get(t) ?? [], splitsBy.get(t) ?? []);
  };

  const benchmarks = {};
  for (const b of BENCHMARKS) {
    const bars = series.get(b);
    if (bars) benchmarks[b] = { bars, dividends: dividendsFor(b) };
    else log(`stock: ${b} has no bars in the cached window, so it cannot be used as a benchmark`);
  }
  const spyBars = series.get('SPY');
  const spy = { return126: spyBars ? trailingReturn(spyBars, 126, dividendsFor('SPY')) : null };

  /* ---- the price pre-screen, which costs nothing and removes most of the universe ---- */
  const shortlist = [];
  for (const ticker of universe.symbols) {
    const tape = tapeSymbol(ticker);
    const bars = series.get(tape);
    if (!bars || bars.length < LIMITS.minSessions) continue;
    if (bars[bars.length - 1].date !== T) continue;
    if (!(bars[bars.length - 1].close >= LIMITS.minClose)) continue;
    const cik = universe.cik[ticker];
    if (!cik) continue;
    shortlist.push({ ticker, tape, cik: String(Number(cik)), name: universe.names[ticker] ?? ticker, bars });
  }
  log(`stock: ${shortlist.length} of ${universe.symbols.length} names priced, long enough and above $${LIMITS.minClose}`);

  /* ---- fundamentals ---- */
  const digest = await ensureDigest();
  const overlay = await ensureOverlay(universe, calendar);
  const facts = mergeFacts(digest.facts, overlay.facts);
  const subs = [...digest.subs, ...overlay.subs];
  const factsByCik = new Map();
  for (const f of facts) {
    const list = factsByCik.get(f.cik);
    if (list) list.push(f);
    else factsByCik.set(f.cik, [f]);
  }
  const subsByCik = new Map();
  for (const s of subs) {
    const list = subsByCik.get(s.cik);
    if (list) list.push(s);
    else subsByCik.set(s.cik, [s]);
  }
  const sicMap = sicByCik(subs);
  let horizon = null;
  for (const s of subs) if (!horizon || s.accepted > horizon) horizon = s.accepted;
  log(`stock: fundamentals cover ${factsByCik.size} companies, accepted up to ${horizon ?? '(nothing)'}`);

  /* ---- the sector reference returns the relative-strength signal needs ---- */
  const sectorReturns = {};
  const byMajor = new Map();
  for (const c of shortlist) {
    const major = sicMajorGroup(sicMap.get(c.cik));
    if (!major) continue;
    const r = trailingReturn(c.bars, 126, dividendsFor(c.ticker));
    if (r == null) continue;
    if (!byMajor.has(major)) byMajor.set(major, []);
    byMajor.get(major).push(r);
  }
  for (const [major, rs] of byMajor) {
    rs.sort((a, b) => a - b);
    sectorReturns[major] = rs[rs.length >> 1];
  }

  /* ---- Stage A and Stage B ---- */
  const open = openPositionsFrom(log2, { calendar, T, sicMap });
  const projected = projectSessions(calendar, HORIZON_SESSIONS + 2);
  const plannedEntry = projected[0] ?? null;
  const plannedExit = plannedEntry ? exitSession([...calendar, ...projected], plannedEntry, HORIZON_SESSIONS) : null;
  const ctx = {
    T,
    asOf: T,
    calendar,
    spy,
    sectorReturns,
    openPositions: open,
    horizonWindow: plannedEntry && plannedExit ? { entry: plannedEntry, exit: plannedExit } : undefined,
  };

  const screened = shortlist.map((c) =>
    screenCandidate(
      {
        ticker: c.ticker,
        name: c.name,
        cik: c.cik,
        sic: sicMap.get(c.cik) ?? '',
        bars: c.bars,
        dividends: dividendsFor(c.ticker),
        facts: factsByCik.get(c.cik) ?? [],
        submissions: subsByCik.get(c.cik) ?? [],
        // Announcements are checked exactly, one candidate at a time, at the top of the ranking: see
        // below. At this stage the test that stands in for it is the filing date itself.
        announcements: [],
        earningsEstimate: null,
      },
      ctx,
    ),
  );
  const capped = applyVolatilityCap(screened);
  const withPeers = peerPercentiles(capped.rows);
  const outcome = decide(withPeers, { include: rules.ranking.candidateSignalsAdopted, T, scanned: universe.symbols.length });
  log(`stock: ${outcome.eligible} eligible of ${shortlist.length} screened; volatility cutoff ${capped.cutoff == null ? 'n/a' : (capped.cutoff * 100).toFixed(0) + '%'}`);
  for (const [test, n] of countBy(withPeers)) log(`  ${String(n).padStart(5)} ${test}`);

  if (!outcome.pick) {
    const reason = outcome.binding
      ? `No candidate qualified today. The test that removed the most was ${outcome.binding.test}: ${outcome.binding.reason} — ${outcome.binding.count.toLocaleString('en-US')} of ${withPeers.length.toLocaleString('en-US')} screened.`
      : `No candidate qualified today. ${outcome.reason}.`;
    log(`stock: ${reason}`);
    await publish(unavailable(reason, { lastPublishedFor: log2.picks.at(-1)?.date ?? null }), {
      hash,
      recaps: await buildRecaps({ log1, log2, calendar, series, dividendsFor, benchmarks, T }),
    });
    return;
  }

  /* ---- the exact earnings test, from the top of the ranking down ---- */
  const ranked = [outcome.pick, ...outcome.runnersUp, ...withPeers.filter((r) => r.eligible && r.composite != null).slice(4, 4 + MAX_SUBMISSIONS)];
  const seen = new Set();
  let chosen = null;
  let estimate = null;
  const skipped = [];
  for (const candidate of ranked) {
    if (!candidate || seen.has(candidate.ticker)) continue;
    seen.add(candidate.ticker);
    if (seen.size > MAX_SUBMISSIONS) break;
    let announcements = [];
    try {
      announcements = earningsAnnouncements(parseSubmissionIndex(await fetchSubmissionIndex(candidate.cik)), { asOf: T });
    } catch (err) {
      log(`stock: ${candidate.ticker} — could not read its filing index (${err.message}); skipped rather than assumed quiet`);
      skipped.push({ ticker: candidate.ticker, why: 'its filing index could not be read' });
      continue;
    }
    const tIndex = sessionIndexAtOrBefore(calendar, T);
    const quietFrom = calendar[Math.max(0, tIndex - (LIMITS.announcementQuietSessions - 1))];
    const recent = announcements.filter((a) => a.date >= quietFrom && a.date <= T);
    if (recent.length > 0) {
      log(`stock: ${candidate.ticker} announced results on ${recent.at(-1).date}, inside the quiet window; next candidate`);
      skipped.push({ ticker: candidate.ticker, why: `it announced results on ${recent.at(-1).date}, inside the quiet window` });
      continue;
    }
    estimate = estimateNextEarnings(announcements, { asOf: T });
    const risk = plannedEntry && plannedExit ? earningsRiskInWindow(estimate, { entry: plannedEntry, exit: plannedExit }) : null;
    if (risk?.confirmed && risk.inWindow) {
      skipped.push({ ticker: candidate.ticker, why: `its results are confirmed for ${estimate.date}, inside the holding window` });
      continue;
    }
    chosen = { candidate, announcements, estimate, risk };
    break;
  }

  if (!chosen) {
    const reason = `No candidate qualified today. The ${seen.size} best-ranked were all set aside: ${skipped.map((s) => `${s.ticker} because ${s.why}`).join('; ')}.`;
    log(`stock: ${reason}`);
    await publish(unavailable(reason, { lastPublishedFor: log2.picks.at(-1)?.date ?? null }), {
      hash,
      recaps: await buildRecaps({ log1, log2, calendar, series, dividendsFor, benchmarks, T }),
    });
    return;
  }

  const row = chosen.candidate;
  const risk = chosen.risk ?? { inWindow: false, nearWindow: false, estimate: chosen.estimate };
  const publishedAt = new Date().toISOString();
  const pick = {
    kind: 'pick',
    strategyVersion: 2,
    strategyHash: hash,
    date: TODAY,
    publishedAt,
    decisionSession: T,
    ticker: row.ticker,
    name: row.name,
    cik: row.cik ?? null,
    sic: row.sic ?? null,
    sector: row.division ?? 'Unclassified',
    industry: row.majorGroup ?? null,
    referenceClose: row.metrics.close,
    referenceCloseDate: row.metrics.asOf,
    horizonSessions: HORIZON_SESSIONS,
    plannedEntry,
    plannedExit,
    thesis: thesisFor(row),
    rankScore: row.rankScore ?? 0,
    composite: row.composite ?? 0,
    scoredAgainst: row.scoredAgainst ?? '',
    scanned: outcome.scanned,
    eligible: outcome.eligible,
    signals: row.contributions.map((c) => ({ key: c.key, label: c.label, value: c.value, z: c.z, cohort: c.cohort })),
    signalsDropped: row.signalsDropped ?? [],
    evidence: evidenceFor(row),
    peers: peersFor(row, withPeers),
    peerBasis: row.peerBasis
      ? `${row.peerBasis.peers} candidates in ${row.peerBasis.against}, compared on ${row.peerBasis.measure}, all from the same source and the same periods.`
      : null,
    runnersUp: runnersUpFor(row, outcome.runnersUp, skipped),
    counterargument: counterargumentFor(row),
    invalidation: invalidationFor(row),
    risks: risksFor(row, { digestHorizon: horizon }),
    earnings: {
      estimate: chosen.estimate?.date ?? null,
      basis: chosen.estimate?.basis ?? null,
      spreadDays: chosen.estimate?.spreadDays ?? null,
      confirmed: false,
      inWindow: risk.inWindow,
      nearWindow: risk.nearWindow,
    },
    rule,
    validation,
    sources,
  };

  log2.picks = [...log2.picks.filter((p) => p.date !== TODAY), {
    date: TODAY,
    publishedAt,
    ticker: row.ticker,
    name: row.name,
    cik: row.cik,
    sic: row.sic,
    division: row.division,
    decisionSession: T,
    referenceClose: row.metrics.close,
    rankScore: pick.rankScore,
    composite: pick.composite,
    strategyHash: hash,
  }].slice(-400);
  await writeJson('state/stocks-v2.json', { strategyVersion: 2, picks: log2.picks });

  const recaps = await buildRecaps({ log1, log2, calendar, series, dividendsFor, benchmarks, T });
  await publish(pick, { hash, recaps });
  log(`stock: ${row.ticker} — ${row.name}, score ${pick.rankScore}/100, entry ${plannedEntry} → exit ${plannedExit}`);
}

/** Positions still inside their horizon, with the SIC division the concentration cap counts. */
function openPositionsFrom(log2, { calendar, T, sicMap }) {
  const out = [];
  for (const p of log2.picks ?? []) {
    const entry = p.entryDate ?? p.date;
    const i = calendar.indexOf(entry);
    if (i < 0) continue;
    const held = sessionIndexAtOrBefore(calendar, T) - i + 1;
    if (held >= HORIZON_SESSIONS) continue;
    out.push({ ticker: p.ticker, division: p.division ?? sicDivision(sicMap.get(String(Number(p.cik ?? 0))) ?? '') });
  }
  return out;
}

/** The chosen name plus up to six comparable candidates from its own industry. */
function peersFor(row, rows) {
  const same = rows.filter((r) => r.eligible && r.majorGroup === row.majorGroup && r.ticker !== row.ticker);
  same.sort((a, b) => (b.figures?.revenueTtm ?? 0) - (a.figures?.revenueTtm ?? 0));
  return [row, ...same.slice(0, 6)].map((r) => ({
    ticker: r.ticker,
    name: r.name ?? null,
    revenueTtm: r.figures?.revenueTtm ?? null,
    revenueGrowth: r.figures?.revenueGrowth ?? null,
    quarterYoY: r.figures?.quarterYoY ?? null,
    grossMargin: r.figures?.grossMargin ?? null,
    operatingMargin: r.figures?.operatingMargin ?? null,
    cashConversion: r.figures?.cashConversion ?? null,
    freeCashFlowTtm: r.figures?.freeCashFlowTtm ?? null,
  }));
}

/** Why the chosen candidate beat the ones just behind it, in their own numbers. */
function runnersUpFor(row, runnersUp, skipped) {
  const out = [];
  for (const s of skipped) {
    if (s.ticker === row.ticker) continue;
    out.push({ ticker: s.ticker, name: s.ticker, rankScore: 0, why: `set aside because ${s.why}` });
  }
  for (const r of runnersUp) {
    if (r.ticker === row.ticker) continue;
    const weakest = [...r.contributions].sort((a, b) => a.z - b.z)[0];
    out.push({
      ticker: r.ticker,
      name: r.name ?? r.ticker,
      rankScore: r.rankScore ?? 0,
      why: weakest ? `its weakest signal was ${weakest.label.toLowerCase()} (${weakest.z.toFixed(2)})` : 'it scored lower on the balance of its signals',
    });
  }
  return out.slice(0, 5);
}

/** Version 2's record, and version 1's positions tracked to the end of their own horizon. */
async function buildRecaps({ log1, log2, calendar, series, dividendsFor, benchmarks, T }) {
  const recaps = [];
  if ((log2.picks ?? []).length > 0) {
    recaps.push(
      recapFor(log2.picks, {
        strategyVersion: 2,
        calendar,
        series,
        dividendsFor,
        benchmarks,
        asOf: T,
        horizon: HORIZON_SESSIONS,
        note: 'Each position is bought at the open of the first session after it was published and held 21 sessions. Costs of 10 basis points each way on the stock and 2 on the benchmark are deducted. Only completed positions enter the average; a position still running is listed with the sessions elapsed and counted nowhere else.',
      }),
    );
  }
  if ((log1.picks ?? []).length > 0) {
    recaps.push(
      recapFor(log1.picks, {
        strategyVersion: 1,
        calendar,
        series,
        dividendsFor,
        benchmarks,
        asOf: T,
        horizon: 5,
        note: 'Version 1 stopped picking on 6 October 2026. Its positions are tracked to the end of a uniform five-session hold using the current price feed, so they are at least comparable with each other. The published version 1 cards are left exactly as they were, and version 1 and version 2 are never combined into one figure.',
      }),
    );
  }
  return recaps;
}

function countBy(rows) {
  const counts = new Map();
  for (const r of rows) {
    const key = r.eligible ? 'eligible' : (r.test ?? 'unclassified');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** The published feed. `decidedFor` is the edition date, so a stale card can say that it is stale. */
async function publish(block, { hash, recaps }) {
  const feed = {
    builtAt: new Date().toISOString(),
    decidedFor: TODAY,
    strategyVersion: 2,
    strategyHash: hash,
    block,
    recaps,
  };
  if (DRY) {
    log('--dry-run: nothing written. The card would be:');
    log(JSON.stringify(feed, null, 1).slice(0, 4000));
    return;
  }
  await writeJson('public/data/stock.json', feed);
  log('wrote public/data/stock.json');
}

main().catch((err) => {
  if (err instanceof SetupError || /SEC_CONTACT must be set/.test(err.message ?? '')) {
    console.error(err.message);
    console.error('');
    console.error('Two repository Actions secrets are needed (Settings -> Secrets and variables -> Actions):');
    console.error('  MASSIVE_API_KEY  a free Massive (Polygon.io) "Stocks Basic" key. No payment method; it');
    console.error('                   blocks rather than bills when the free allowance is spent.');
    console.error('  SEC_CONTACT      a working email address. The SEC refuses automated requests that do not');
    console.error('                   declare a contact, and a false one would misrepresent who is asking.');
    console.error('');
    console.error('Nothing has been published.');
    process.exit(1);
  }
  if (err instanceof KeyRejected) {
    console.error(`The price feed would not accept the key: ${err.message}`);
    console.error('');
    console.error('Check the MASSIVE_API_KEY secret against the key on your Massive dashboard. The whole');
    console.error('key is one unbroken string — a stray space or a missing character at either end is the');
    console.error('usual cause. Nothing has been published.');
    process.exit(1);
  }
  if (err instanceof OutsideEntitlement) {
    console.error(`The price feed will not serve that history on this plan: ${err.message}`);
    console.error('The free plan covers two years. Nothing has been published.');
    process.exit(1);
  }
  if (err instanceof AllowanceExhausted) {
    console.error(`The price plan's free allowance is exhausted: ${err.message}`);
    console.error('Nothing has been published. No paid plan will be activated; the run will try again on its next schedule.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
