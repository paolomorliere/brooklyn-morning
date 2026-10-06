// Selection: who is eligible, how the eligible are compared, and why one of them was chosen.
//
// The structure is deliberate and the card reports which stage decided the outcome.
//
//   **Stage A — eligibility.** Binary. Tradable, liquid, enough history for the formulas to be
//   defined, financials recent and usable, inside the risk limits. Failing a test removes a
//   candidate; it never becomes a neutral score, because a neutral score is a claim that the company
//   is average at something nobody measured.
//
//   **Stage B — comparison.** Equal-weighted z-scores within a sector group, over the signals that
//   are *defined* for that group. Equal weights because nothing in a sample this small justifies
//   anything else; arbitrary complexity is not evidence of an advantage.
//
// The distinction that does the most work here is **inapplicable versus missing**. A bank has no
// gross profit — measured coverage of `GrossProfit` is 4.3% among finance, insurance and REIT filers
// against 53.5% among operating filers — so gross profitability is dropped for that group, the
// remaining weights renormalise, and the card lists which signals produced the score. A company that
// should report revenue and does not is a different case: it is ineligible. Neither is ever silently
// scored zero.

import {
  TAGS,
  chooseInstantTag,
  chooseQuarterlyTag,
  daysBetween,
  latestFinancialFiling,
  previousQuarterEnd,
  quarterlySeries,
  sectorGroupOf,
  sicDivision,
  sicMajorGroup,
  ttmAt,
  yearAgoEnd,
} from './fundamentals.mjs';
import { announcedBetween, earningsRiskInWindow } from './earnings.mjs';
import {
  aboveTrend,
  clip,
  extension as extensionOf,
  medianDollarVolume,
  momentum12_1,
  percentileOf,
  quantile,
  realisedVol,
  sma,
  trailingReturn,
  zScores,
} from './signals.mjs';
import { HORIZON_SESSIONS, sessionIndexAtOrBefore } from './portfolio.mjs';

/** Stage A thresholds. Every one of them is a published number the card can quote. */
export const LIMITS = {
  minClose: 5,
  minMedianDollarVolume: 20_000_000,
  /**
   * 253 sessions, derived rather than chosen: 12−1 momentum reads `close[T−252]` and `close[T−21]`,
   * so it needs indices 0 through 252 — 253 observations. The 200-session average needs 200 and
   * 60-session volatility needs 61, both of which fit inside that. The builder asks the feed for 260
   * for slack; eligibility is tested at the real boundary.
   */
  minSessions: 253,
  maxFinancialsAgeDays: 200,
  volatilityPercentile: 0.85,
  maxLeverage: 6,
  maxOpenPositions: HORIZON_SESSIONS,
  maxPerDivision: 3,
  /** An announcement this recent means post-announcement drift, which is a different strategy. */
  announcementQuietSessions: 2,
  /** Above this many daily standard deviations over the 50-session average, the entry is stretched. */
  maxExtension: 3,
  /** Fewer peers than this and a percentile within the group says nothing. */
  minPeerGroup: 8,
};

/**
 * The ranking signals, and which sector groups each one is defined for.
 *
 * `direction` is +1 where more is better and −1 where less is. Gross margin trend and gross
 * profitability are scoped to operating companies on measured coverage, not on taste: `GrossProfit`
 * appears for 53.5% of operating filers, 11.2% of utilities, 8.8% of energy and 4.3% of finance. A
 * signal defined for a tenth of a group is not a comparison, it is a lottery among the tenth that
 * happen to tag it.
 */
export const SIGNALS = [
  { key: 'revenueGrowth', label: 'Revenue growth, trailing year', direction: 1, groups: null },
  { key: 'growthAcceleration', label: 'Growth acceleration', direction: 1, groups: null },
  { key: 'grossMarginTrend', label: 'Gross margin trend', direction: 1, groups: ['operating'] },
  { key: 'operatingMarginTrend', label: 'Operating margin trend', direction: 1, groups: ['operating', 'utilities', 'energy'] },
  { key: 'cashConversion', label: 'Cash conversion', direction: 1, groups: ['operating', 'utilities', 'energy'] },
  { key: 'grossProfitability', label: 'Gross profit over assets', direction: 1, groups: ['operating'] },
  { key: 'returnOnEquity', label: 'Return on equity', direction: 1, groups: ['finance'] },
  { key: 'leverage', label: 'Debt over operating cash flow', direction: -1, groups: ['operating', 'utilities', 'energy'] },
  { key: 'equityToAssets', label: 'Equity over assets', direction: 1, groups: ['finance'] },
  { key: 'fcfYield', label: 'Free cash flow yield', direction: 1, groups: ['operating', 'utilities', 'energy'] },
  { key: 'earningsYield', label: 'Earnings yield', direction: 1, groups: null },
  { key: 'peerPercentile', label: 'Valuation against its own industry', direction: 1, groups: null },
  { key: 'relativeStrengthSpy', label: 'Six-month return against SPY', direction: 1, groups: null },
  { key: 'relativeStrengthSector', label: 'Six-month return against its sector', direction: 1, groups: null },
];

/**
 * Signals that are in the specification but are **not** in the composite until the development window
 * says they earn a place there. Evidence for a diversified long-short momentum factor is not evidence
 * for a long-only, one-pick-a-day, 21-session rule, and six observations of short-term reversal
 * establish nothing at all. They are computed, published on the card and measured — and the file that
 * freezes the rules records which, if any, were adopted.
 */
export const CANDIDATE_SIGNALS = [
  { key: 'momentum12_1', label: '12−1 momentum', direction: 1, groups: null },
  { key: 'return5', label: 'Five-session return', direction: -1, groups: null },
];

function appliesTo(signal, group) {
  return signal.groups == null || signal.groups.includes(group);
}

/** Pure: the signal keys that are defined for a sector group. */
export function signalsForGroup(group, { include = [] } = {}) {
  const extra = CANDIDATE_SIGNALS.filter((s) => include.includes(s.key));
  return [...SIGNALS, ...extra].filter((s) => appliesTo(s, group));
}

/* ------------------------------------------------------------------ fundamentals per company */

/** The first tag whose quarterly series supports a trailing year ending `end`. */
function flowTtm(facts, preference, { end, yearAgo, asOf }) {
  for (const tag of preference) {
    const series = quarterlySeries(facts, { tag, asOf });
    const ttm = ttmAt(series, end);
    if (!ttm) continue;
    const prior = yearAgo ? ttmAt(series, yearAgo) : null;
    return { tag, series, ttm, prior };
  }
  return null;
}

function ratio(numerator, denominator) {
  if (numerator == null || denominator == null) return null;
  if (!(denominator > 0)) return null;
  return numerator / denominator;
}

function growth(now, before) {
  if (now == null || before == null) return null;
  if (!(before > 0)) return null;
  return now / before - 1;
}

/**
 * Everything the filings say about one company as at `asOf`, plus the tag each figure came from.
 *
 * Returns `{ ok: false, reason }` when a signal the specification makes mandatory cannot be built —
 * revenue, its growth and its acceleration. Everything else that is absent is recorded in `dropped`
 * and the weights renormalise over what remains.
 */
export function companyFigures(candidate, { asOf, close }) {
  const { facts, sic } = candidate;
  const group = sectorGroupOf(sic);
  const dropped = [];
  const tags = {};
  const note = (key, why) => dropped.push({ key, why });

  const rev = chooseQuarterlyTag(facts, TAGS.revenue, { asOf, quarters: 8 });
  if (!rev) return { ok: false, reason: 'no revenue series with eight consecutive quarters on file', group };
  const end = rev.end;
  const yearAgo = yearAgoEnd(rev.series, end);
  if (!yearAgo) return { ok: false, reason: `no comparable quarter a year before ${end}`, group };
  tags.revenue = rev.tag;

  const revTtm = ttmAt(rev.series, end);
  const revPrior = ttmAt(rev.series, yearAgo);
  if (!revTtm || !revPrior) return { ok: false, reason: 'trailing-year revenue cannot be assembled from single quarters', group };
  const revenueGrowth = growth(revTtm.value, revPrior.value);
  if (revenueGrowth == null) return { ok: false, reason: 'the year-ago revenue base is not positive', group };

  // Acceleration compares the latest quarter's year-on-year rate with the previous quarter's.
  const prevEnd = previousQuarterEnd(rev.series, end);
  const prevYearAgo = prevEnd ? yearAgoEnd(rev.series, prevEnd) : null;
  const qNow = growth(rev.series.get(end)?.value, rev.series.get(yearAgo)?.value);
  const qPrev = prevEnd && prevYearAgo ? growth(rev.series.get(prevEnd)?.value, rev.series.get(prevYearAgo)?.value) : null;
  if (qNow == null || qPrev == null) return { ok: false, reason: 'two comparable quarterly year-on-year rates are not available', group };
  const growthAcceleration = qNow - qPrev;

  const flows = {};
  for (const [key, preference] of [
    ['netIncome', TAGS.netIncome],
    ['grossProfit', TAGS.grossProfit],
    ['operatingIncome', TAGS.operatingIncome],
    ['operatingCashFlow', TAGS.operatingCashFlow],
    ['capex', TAGS.capex],
  ]) {
    const got = flowTtm(facts, preference, { end, yearAgo, asOf });
    if (got) {
      flows[key] = got;
      tags[key] = got.tag;
    }
  }

  const assets = chooseInstantTag(facts, TAGS.assets, { asOf });
  const equity = chooseInstantTag(facts, TAGS.equity, { asOf });
  let shares = chooseInstantTag(facts, TAGS.shares, { asOf, uom: 'shares' });
  if (!shares) {
    // No share count on a date, so fall back to the weighted average over the latest quarter. It is an
    // average rather than a count, which is why it is last; a company with several share classes often
    // reports its per-class counts in a way this project filters out as non-consolidated, and without
    // this fallback a third of the market would have no valuation signals at all.
    const weighted = chooseQuarterlyTag(facts, TAGS.sharesWeighted, { asOf, uom: 'shares', quarters: 1 });
    if (weighted) {
      const point = weighted.series.get(weighted.end);
      shares = { tag: weighted.tag, series: weighted.series, end: weighted.end, fact: point };
    }
  }
  const cash = chooseInstantTag(facts, TAGS.cash, { asOf });
  if (assets) tags.assets = assets.tag;
  if (equity) tags.equity = equity.tag;
  if (shares) tags.shares = shares.tag;
  if (cash) tags.cash = cash.tag;

  // Total borrowings, assembled so nothing is counted twice. `LongTermDebt` already includes current
  // maturities, so when a filer reports it the current-portion tag is not added; only a filer that
  // reports the non-current balance has its current portion added back.
  const ltdTotal = chooseInstantTag(facts, TAGS.longTermDebtTotal, { asOf });
  const ltdNon = ltdTotal ? null : chooseInstantTag(facts, TAGS.longTermDebtNoncurrent, { asOf });
  const ltdCur = ltdTotal ? null : chooseInstantTag(facts, TAGS.longTermDebtCurrent, { asOf });
  const std = chooseInstantTag(facts, TAGS.shortTermDebt, { asOf });
  const debtParts = [ltdTotal, ltdNon, ltdCur, std].filter(Boolean);
  const totalDebt = debtParts.length ? debtParts.reduce((a, x) => a + x.fact.value, 0) : null;
  if (debtParts.length) tags.debt = debtParts.map((x) => x.tag).join(' + ');
  const marketCap = shares && close > 0 ? shares.fact.value * close : null;
  if (!marketCap) note('marketCap', 'no share count on file, so no valuation signal can be formed');

  const f = {};
  f.revenueGrowth = revenueGrowth;
  f.growthAcceleration = growthAcceleration;
  f.quarterYoY = qNow;
  f.quarterYoYPrior = qPrev;
  f.revenueTtm = revTtm.value;
  f.revenueTtmPrior = revPrior.value;

  // Margins, each against the revenue total chosen above, so numerator and denominator agree.
  const gm = ratio(flows.grossProfit?.ttm.value, revTtm.value);
  const gmPrior = ratio(flows.grossProfit?.prior?.value, revPrior.value);
  f.grossMargin = gm;
  f.grossMarginPrior = gmPrior;
  f.grossMarginTrend = gm != null && gmPrior != null ? gm - gmPrior : null;
  if (f.grossMarginTrend == null) note('grossMarginTrend', flows.grossProfit ? 'no comparable year-ago gross profit' : 'gross profit is not reported');

  const om = ratio(flows.operatingIncome?.ttm.value, revTtm.value);
  const omPrior = ratio(flows.operatingIncome?.prior?.value, revPrior.value);
  f.operatingMargin = om;
  f.operatingMarginPrior = omPrior;
  f.operatingMarginTrend = om != null && omPrior != null ? om - omPrior : null;
  if (f.operatingMarginTrend == null) note('operatingMarginTrend', flows.operatingIncome ? 'no comparable year-ago operating income' : 'operating income is not reported');

  f.netIncomeTtm = flows.netIncome?.ttm.value ?? null;
  f.operatingCashFlowTtm = flows.operatingCashFlow?.ttm.value ?? null;
  f.capexTtm = flows.capex?.ttm.value ?? null;
  f.grossProfitTtm = flows.grossProfit?.ttm.value ?? null;
  f.assets = assets?.fact.value ?? null;
  f.equity = equity?.fact.value ?? null;
  f.shares = shares?.fact.value ?? null;
  f.sharesAsOf = shares?.end ?? null;
  f.totalDebt = totalDebt;
  f.cash = cash?.fact.value ?? null;
  f.netDebt = totalDebt != null && f.cash != null ? totalDebt - f.cash : null;
  f.balanceSheetAsOf = assets?.end ?? ltdTotal?.end ?? ltdNon?.end ?? null;
  f.marketCap = marketCap;

  // Cash conversion only means something against positive earnings. A positive operating cash flow
  // divided by a loss produces a negative ratio that reads as poor quality when the truth is the
  // opposite, so the signal is dropped rather than inverted by accident.
  if (f.operatingCashFlowTtm != null && f.netIncomeTtm != null && f.netIncomeTtm > 0) {
    f.cashConversion = clip(f.operatingCashFlowTtm / f.netIncomeTtm, -3, 3);
  } else {
    f.cashConversion = null;
    note('cashConversion', f.netIncomeTtm == null ? 'net income is not reported' : 'trailing net income is not positive');
  }

  f.grossProfitability = ratio(f.grossProfitTtm, f.assets);
  if (f.grossProfitability == null && group === 'operating') note('grossProfitability', 'gross profit or total assets is not reported');

  f.returnOnEquity = ratio(f.netIncomeTtm, f.equity);
  if (f.returnOnEquity == null && group === 'finance') note('returnOnEquity', 'net income or shareholders\' equity is not reported');

  f.equityToAssets = ratio(f.equity, f.assets);

  f.leverage = f.totalDebt != null && f.operatingCashFlowTtm != null && f.operatingCashFlowTtm > 0 ? f.totalDebt / f.operatingCashFlowTtm : null;
  f.netLeverage = f.netDebt != null && f.operatingCashFlowTtm != null && f.operatingCashFlowTtm > 0 ? f.netDebt / f.operatingCashFlowTtm : null;
  f.freeCashFlowTtm = f.operatingCashFlowTtm != null && f.capexTtm != null ? f.operatingCashFlowTtm - f.capexTtm : null;
  f.fcfYield = ratio(f.freeCashFlowTtm, marketCap);
  if (f.fcfYield == null) note('fcfYield', f.capexTtm == null ? 'capital expenditure is not reported' : 'no market capitalisation to divide by');
  // A negative earnings yield is kept and sorts last, which is a true statement about the company.
  f.earningsYield = marketCap && f.netIncomeTtm != null ? f.netIncomeTtm / marketCap : null;
  if (f.earningsYield == null) note('earningsYield', 'no net income or no market capitalisation');

  return {
    ok: true,
    group,
    division: sicDivision(sic),
    majorGroup: sicMajorGroup(sic),
    periodEnd: end,
    yearAgoEnd: yearAgo,
    tags,
    dropped,
    figures: f,
    provenance: {
      revenue: { adsh: revTtm.adsh, form: revTtm.form, filed: revTtm.filed, accepted: revTtm.accepted, quarters: revTtm.quarters },
      derivedQuarters: revTtm.derived,
    },
  };
}

/* ------------------------------------------------------------------ Stage A */

/**
 * Pure: every Stage A test that depends only on this candidate.
 *
 * The volatility cap is the one exception — it is defined against the eligible set's own 85th
 * percentile, so it cannot be known until the set is. `applyVolatilityCap` finishes the job.
 */
export function screenCandidate(candidate, ctx) {
  const { T, asOf, spy, sectorReturns = {}, openPositions = [], horizonWindow, calendar = [] } = ctx;
  const bars = candidate.bars ?? [];
  // Every rejection names the test that fired as well as the sentence a reader sees. Grouping the
  // day's rejections by `test` is the only way the card can say "4,611 removed on liquidity" — the
  // sentences carry each company's own numbers, so no two of them are ever the same string.
  const reject = (test, reason) => ({ ticker: candidate.ticker, eligible: false, test, reason });

  // The portfolio holds one position per session for 21 sessions, so on a full book there is no slot
  // to fill and no amount of quality changes that.
  if (openPositions.length >= LIMITS.maxOpenPositions) {
    return reject('book-full', `all ${LIMITS.maxOpenPositions} position slots are already open`);
  }
  if (bars.length === 0) return reject('history', 'no price history');
  const last = bars[bars.length - 1];
  if (last.date !== T) return reject('priced-at-T', `no bar for the decision session ${T}`);
  if (!(last.close >= LIMITS.minClose)) return reject('price', `close ${last.close.toFixed(2)} is below $${LIMITS.minClose}`);
  if (bars.length < LIMITS.minSessions) return reject('history', `${bars.length} sessions of history, fewer than the ${LIMITS.minSessions} the formulas need`);

  const liquidity = medianDollarVolume(bars, 60);
  if (liquidity == null) return reject('liquidity', 'not enough sessions to measure liquidity');
  if (liquidity < LIMITS.minMedianDollarVolume) {
    return reject('liquidity', `median daily turnover $${Math.round(liquidity / 1e6)}M is below $${LIMITS.minMedianDollarVolume / 1e6}M`);
  }

  const trend = aboveTrend(bars);
  if (trend == null) return reject('trend', 'not enough sessions for a 200-session average');
  if (!trend) return reject('trend', 'the close is below its 200-session average');

  const filing = latestFinancialFiling(candidate.submissions, asOf);
  if (!filing) return reject('financials-on-file', 'no 10-Q or 10-K on file at the decision date');
  if (!filing.period) return reject('financials-on-file', 'the most recent filing does not state its period');
  const age = daysBetween(filing.period, T);
  if (!(age >= 0) || age > LIMITS.maxFinancialsAgeDays) {
    return reject('financials-recent', `the most recent filing covers a period ending ${filing.period}, ${age} days before ${T}`);
  }

  // The quiet window is counted in sessions off the trading calendar, so a long weekend does not
  // quietly shrink it. Without a calendar it collapses to the decision session itself.
  const tIndex = calendar.length ? sessionIndexAtOrBefore(calendar, T) : -1;
  const quietFrom =
    tIndex >= 0 ? calendar[Math.max(0, tIndex - (LIMITS.announcementQuietSessions - 1))] : T;
  const recent = announcedBetween(candidate.announcements ?? [], quietFrom, T);
  if (recent.length > 0) return reject('just-announced', `results were announced on ${recent[recent.length - 1].date}, inside the quiet window`);

  if (openPositions.some((p) => p.ticker === candidate.ticker)) return reject('already-held', 'a position in this stock is already open');

  const division = sicDivision(candidate.sic);
  const inDivision = openPositions.filter((p) => p.division === division).length;
  if (inDivision >= LIMITS.maxPerDivision) return reject('division-cap', `${inDivision} open positions already in ${division}`);

  const figures = companyFigures(candidate, { asOf, close: last.close });
  if (!figures.ok) return reject('fundamentals', figures.reason);

  // Leverage above six times operating cash flow, or cash flow that is negative at all, is a
  // refinancing risk this horizon cannot absorb. Banks are exempt: their cash flow statement is a
  // trading-book artefact — JPMorgan's trailing operating cash flow is −$211.8bn — so leverage is
  // judged on equity over assets for them instead.
  if (figures.group !== 'finance') {
    if (figures.figures.operatingCashFlowTtm == null) return reject('cash-flow', 'operating cash flow is not reported');
    if (!(figures.figures.operatingCashFlowTtm > 0)) return reject('cash-flow', 'trailing operating cash flow is negative');
    if (figures.figures.leverage != null && figures.figures.leverage > LIMITS.maxLeverage) {
      return reject('leverage', `debt is ${figures.figures.leverage.toFixed(1)}× operating cash flow, above ${LIMITS.maxLeverage}×`);
    }
  }

  const earnings = horizonWindow
    ? earningsRiskInWindow(candidate.earningsEstimate, horizonWindow)
    : { inWindow: false, nearWindow: false, estimate: candidate.earningsEstimate ?? null };
  // A *confirmed* release inside the window would make this a bet on the release. No free source
  // publishes confirmed forward dates, so in practice this is a risk printed on the card; the branch
  // exists so that the day a confirmed source appears, the rule is already in place.
  if (earnings.confirmed && earnings.inWindow) {
    return reject('earnings-in-window', `results are confirmed for ${earnings.estimate.date}, inside the holding window`);
  }

  const vol = realisedVol(bars, 60);
  const metrics = {
    close: last.close,
    asOf: last.date,
    liquidity,
    sessions: bars.length,
    sma50: sma(bars, 50),
    sma200: sma(bars, 200),
    volatility: vol,
    extension: extensionOf(bars),
    momentum12_1: momentum12_1(bars, candidate.dividends ?? []),
    return5: trailingReturn(bars, 5, candidate.dividends ?? []),
    return126: trailingReturn(bars, 126, candidate.dividends ?? []),
    spy126: spy?.return126 ?? null,
    sector126: sectorReturns[figures.majorGroup] ?? null,
  };
  metrics.relativeStrengthSpy = metrics.return126 != null && metrics.spy126 != null ? metrics.return126 - metrics.spy126 : null;
  metrics.relativeStrengthSector = metrics.return126 != null && metrics.sector126 != null ? metrics.return126 - metrics.sector126 : null;

  return {
    ticker: candidate.ticker,
    name: candidate.name,
    cik: candidate.cik,
    sic: candidate.sic,
    eligible: true,
    test: null,
    reason: null,
    group: figures.group,
    division,
    majorGroup: figures.majorGroup,
    periodEnd: figures.periodEnd,
    tags: figures.tags,
    dropped: figures.dropped,
    figures: figures.figures,
    provenance: figures.provenance,
    filing: { adsh: filing.adsh, form: filing.form, period: filing.period, filed: filing.filed, accepted: filing.accepted },
    earnings,
    metrics,
  };
}

/**
 * The volatility cap, which only exists relative to the day's own eligible set.
 *
 * A fixed threshold would admit everything in a calm market and nothing in a panic. The 85th
 * percentile of the eligible set keeps the proportion constant, and the cutoff is returned so the
 * card can quote the actual number rather than "a percentile".
 */
export function applyVolatilityCap(rows, { percentile = LIMITS.volatilityPercentile } = {}) {
  const eligible = rows.filter((r) => r.eligible);
  const vols = eligible.map((r) => r.metrics?.volatility?.annual).filter((v) => Number.isFinite(v));
  if (vols.length < 5) return { rows, cutoff: null };
  const cutoff = quantile(vols, percentile);
  const out = rows.map((r) => {
    if (!r.eligible) return r;
    const v = r.metrics?.volatility?.annual;
    if (!Number.isFinite(v)) return { ...r, eligible: false, test: 'volatility', reason: 'volatility cannot be measured' };
    if (v > cutoff) {
      return {
        ...r,
        eligible: false,
        test: 'volatility',
        reason: `annualised volatility ${(v * 100).toFixed(0)}% is above the day's ${Math.round(percentile * 100)}th percentile of ${(cutoff * 100).toFixed(0)}%`,
      };
    }
    return r;
  });
  return { rows: out, cutoff };
}

/* ------------------------------------------------------------------ Stage B */

/** The value a signal reads, wherever it lives on the row. */
function signalValue(row, key) {
  const v = row.figures?.[key];
  if (v != null) return v;
  const m = row.metrics?.[key];
  return m == null ? null : m;
}

/**
 * The valuation percentile against the candidate's own industry.
 *
 * Free cash flow yield for companies that have one, earnings yield for banks, where free cash flow
 * is not a meaningful construct. Below `minPeerGroup` members the industry percentile says nothing,
 * so the comparison widens to the whole sector group and that widening is recorded.
 */
export function peerPercentiles(rows, { minPeerGroup = LIMITS.minPeerGroup } = {}) {
  const measureOf = (r) => (r.group === 'finance' ? r.figures?.earningsYield : r.figures?.fcfYield);
  const byMajor = new Map();
  const byGroup = new Map();
  for (const r of rows) {
    const v = measureOf(r);
    if (!Number.isFinite(v)) continue;
    const major = r.majorGroup ?? '--';
    if (!byMajor.has(major)) byMajor.set(major, []);
    byMajor.get(major).push(v);
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(v);
  }
  return rows.map((r) => {
    const v = measureOf(r);
    if (!Number.isFinite(v)) return { ...r, peerBasis: null };
    const major = r.majorGroup ?? '--';
    const peers = byMajor.get(major) ?? [];
    const wide = peers.length < minPeerGroup;
    const set = wide ? (byGroup.get(r.group) ?? []) : peers;
    return {
      ...r,
      figures: { ...r.figures, peerPercentile: percentileOf(set, v) },
      peerBasis: {
        measure: r.group === 'finance' ? 'earnings yield' : 'free cash flow yield',
        against: wide ? `all ${r.group} candidates` : `SIC major group ${major}`,
        widened: wide,
        peers: set.length,
      },
    };
  });
}

/**
 * Score the eligible candidates.
 *
 * Z-scores are computed within sector group, because a utility's margin trend and a software
 * company's are not the same quantity. A group with fewer than `minPeerGroup` members cannot support
 * a within-group z-score, so it is scored against the whole eligible set and `scoredAgainst` says so.
 *
 * The composite is the plain mean of the applicable signals' directed z-scores. Taking the mean *is*
 * the renormalisation: a bank scored on nine signals and a manufacturer scored on twelve are both on
 * the same scale, and neither gets a zero for a signal that does not exist for it.
 */
export function rankCandidates(rows, { include = [], minPeerGroup = LIMITS.minPeerGroup } = {}) {
  const eligible = rows.filter((r) => r.eligible);
  if (eligible.length === 0) return [];

  const groups = new Map();
  for (const r of eligible) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group).push(r);
  }

  const scored = new Map();
  for (const r of eligible) scored.set(r.ticker, { contributions: [], scoredAgainst: null });

  for (const [group, members] of groups) {
    const small = members.length < minPeerGroup;
    const cohort = small ? eligible : members;
    for (const r of members) scored.get(r.ticker).scoredAgainst = small ? `all ${eligible.length} eligible candidates` : `${members.length} ${group} candidates`;
    for (const signal of signalsForGroup(group, { include })) {
      const present = cohort.filter((c) => Number.isFinite(signalValue(c, signal.key)));
      if (present.length < 3) continue;
      const { z, trimmed } = zScores(present.map((c) => signalValue(c, signal.key)));
      const zByTicker = new Map(present.map((c, i) => [c.ticker, z[i]]));
      for (const r of members) {
        const zv = zByTicker.get(r.ticker);
        if (zv == null) continue;
        scored.get(r.ticker).contributions.push({
          key: signal.key,
          label: signal.label,
          value: signalValue(r, signal.key),
          z: zv * signal.direction,
          direction: signal.direction,
          cohort: present.length,
          trimmed,
        });
      }
    }
  }

  const withScores = eligible.map((r) => {
    const s = scored.get(r.ticker);
    const used = s.contributions;
    const composite = used.length ? used.reduce((a, c) => a + c.z, 0) / used.length : null;
    const stretched = Number.isFinite(r.metrics?.extension) && r.metrics.extension > LIMITS.maxExtension;
    return {
      ...r,
      contributions: used,
      signalsUsed: used.map((c) => c.key),
      signalsDropped: r.dropped ?? [],
      scoredAgainst: s.scoredAgainst,
      composite,
      stretched,
      stretchedNote: stretched
        ? `the close is ${r.metrics.extension.toFixed(1)} daily standard deviations above its 50-session average`
        : null,
    };
  });

  const comparable = withScores.filter((r) => r.composite != null);
  const all = comparable.map((r) => r.composite);
  for (const r of comparable) {
    // Deliberately a percentile, not a scaled score. "85" means this candidate ranked above 85% of
    // the eligible set today, which is the only thing the number can honestly mean.
    r.rankScore = Math.round((percentileOf(all, r.composite) ?? 0) * 100);
  }

  // An overextended entry is ranked behind every candidate that is not, rather than docked by some
  // invented number of points. The order is otherwise composite descending, then ticker, so the same
  // inputs always produce the same pick.
  comparable.sort((a, b) => {
    if (a.stretched !== b.stretched) return a.stretched ? 1 : -1;
    if (b.composite !== a.composite) return b.composite - a.composite;
    return a.ticker < b.ticker ? -1 : 1;
  });
  return comparable;
}

/**
 * The day's decision.
 *
 * When nothing is eligible the answer is "no qualifying pick today" together with the test that
 * removed the most candidates — not a relaxed threshold. The thresholds are published; moving one to
 * fill a card would make every number on it meaningless.
 */
export function decide(rows, { include = [], T, scanned } = {}) {
  const ranked = rankCandidates(rows, { include });
  const eligible = rows.filter((r) => r.eligible).length;
  if (ranked.length === 0) {
    const counts = new Map();
    for (const r of rows) {
      if (r.eligible) continue;
      const key = r.test ?? 'unclassified';
      const seen = counts.get(key);
      if (seen) seen.count++;
      else counts.set(key, { test: key, reason: r.reason, count: 1 });
    }
    const binding =
      [...counts.values()].sort((a, b) => b.count - a.count || (a.test < b.test ? -1 : 1))[0] ?? null;
    return {
      pick: null,
      runnersUp: [],
      T,
      scanned: scanned ?? rows.length,
      eligible,
      reason:
        eligible > 0
          ? 'no eligible candidate had enough comparable signals to be scored'
          : 'no candidate passed the eligibility tests',
      binding,
    };
  }
  return {
    pick: ranked[0],
    runnersUp: ranked.slice(1, 4),
    T,
    scanned: scanned ?? rows.length,
    eligible,
    reason: null,
    binding: null,
  };
}
