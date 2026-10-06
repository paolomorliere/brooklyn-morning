import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  applyVolatilityCap,
  companyFigures,
  decide,
  peerPercentiles,
  rankCandidates,
  screenCandidate,
  signalsForGroup,
} from '../scripts/lib/select.mjs';
import type { Candidate, ScreenContext } from '../scripts/lib/select.mjs';
import type { Fact } from '../scripts/lib/fundamentals.d.mts';
import type { Bar } from '../scripts/lib/signals.d.mts';

/* ------------------------------------------------------------------ fixture machinery */

const T = '2026-06-30';

/** Nine consecutive calendar quarter ends, ending two quarters before the decision date. */
const QUARTERS = [
  '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31',
  '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31',
  '2026-03-31',
];

/** Each quarter is filed 45 days after it ends, which is ordinary for a 10-Q. */
const acceptedFor = (ddate: string) =>
  new Date(Date.parse(`${ddate}T00:00:00Z`) + 45 * 86_400_000).toISOString().replace('.000Z', '.000Z');

const fact = (cik: string, tag: string, ddate: string, qtrs: number, value: number, uom = 'USD'): Fact => ({
  cik,
  adsh: `${cik}-${ddate}`,
  tag,
  version: 'us-gaap/2026',
  ddate,
  qtrs,
  uom,
  value,
  accepted: acceptedFor(ddate),
  filed: ddate,
  form: ddate.endsWith('12-31') ? '10-K' : '10-Q',
  period: ddate,
  fy: ddate.slice(0, 4),
  fp: 'Q',
  prevrpt: false,
});

/** A deterministic walk, so every test in this file sees the same prices on every run. */
const walk = (seed: number) => {
  let x = seed;
  return () => {
    x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
    return x / 2_147_483_648 - 0.5;
  };
};

const sessionDates = (n: number, endDate: string) => {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
};

/**
 * A price path that oscillates around an exponential trend rather than compounding its own noise.
 *
 * A random walk would leave whether a candidate sits above its 200-session average up to the seed,
 * which is realistic but useless in a test: half the fixtures would fail Stage A for a reason the
 * test is not about. Here `drift` controls the trend, `amp` controls volatility, and both are
 * independent of the seed, so a fixture fails only the test it is built to fail.
 */
const makeBars = (n: number, { close = 100, drift = 0.0004, amp = 0.02, seed = 7, volume = 2_000_000, end = T } = {}): Bar[] => {
  const r = walk(seed);
  const dates = sessionDates(n, end);
  return dates.map((date, i) => {
    const trend = close * (1 + drift) ** (i - (n - 1));
    const c = trend * (1 + amp * r());
    const open = trend * (1 + amp * r());
    return { date, open, high: Math.max(open, c), low: Math.min(open, c), close: c, volume };
  });
};

interface Knobs {
  ticker: string;
  sic?: string;
  seed?: number;
  sessions?: number;
  close?: number;
  volume?: number;
  amp?: number;
  /** Quarterly revenue at the oldest quarter, compounding by `qGrowth` each quarter. */
  revenue?: number;
  qGrowth?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  ocfMultiple?: number;
  capexRate?: number;
  debt?: number;
  shares?: number;
  omit?: string[];
}

const candidateFor = (k: Knobs): Candidate => {
  const cik = k.ticker;
  const omit = new Set(k.omit ?? []);
  const facts: Fact[] = [];
  const rev0 = k.revenue ?? 1_000;
  const g = k.qGrowth ?? 0.03;
  QUARTERS.forEach((d, i) => {
    const revenue = rev0 * (1 + g) ** i;
    const push = (tag: string, value: number, qtrs = 1, uom = 'USD') => {
      if (omit.has(tag)) return;
      facts.push(fact(cik, tag, d, qtrs, value, uom));
    };
    push('RevenueFromContractWithCustomerExcludingAssessedTax', revenue);
    push('GrossProfit', revenue * (k.grossMargin ?? 0.55));
    push('OperatingIncomeLoss', revenue * (k.operatingMargin ?? 0.25));
    push('NetIncomeLoss', revenue * (k.netMargin ?? 0.18));
    push('NetCashProvidedByUsedInOperatingActivities', revenue * (k.netMargin ?? 0.18) * (k.ocfMultiple ?? 1.2));
    push('PaymentsToAcquirePropertyPlantAndEquipment', revenue * (k.capexRate ?? 0.05));
    push('Assets', revenue * 12, 0);
    push('StockholdersEquity', revenue * 6, 0);
    push('LongTermDebt', k.debt ?? revenue * 2, 0);
    push('EntityCommonStockSharesOutstanding', k.shares ?? 1_000_000, 0, 'shares');
  });
  const submissions = QUARTERS.map((d) => ({
    adsh: `${cik}-${d}`,
    cik,
    name: k.ticker,
    sic: k.sic ?? '3674',
    form: d.endsWith('12-31') ? '10-K' : '10-Q',
    period: d,
    fy: d.slice(0, 4),
    fp: 'Q',
    filed: d,
    accepted: acceptedFor(d),
    prevrpt: false,
  }));
  return {
    ticker: k.ticker,
    name: k.ticker,
    cik,
    sic: k.sic ?? '3674',
    bars: makeBars(k.sessions ?? 260, { close: k.close ?? 100, seed: k.seed ?? 7, volume: k.volume ?? 2_000_000, amp: k.amp ?? 0.02 }),
    dividends: [],
    facts,
    submissions,
    announcements: [],
    earningsEstimate: null,
  };
};

const ctx = (over: Partial<ScreenContext> = {}): ScreenContext => ({
  T,
  asOf: T,
  calendar: sessionDates(260, T),
  spy: { return126: 0.05 },
  sectorReturns: { '36': 0.06 },
  openPositions: [],
  horizonWindow: { entry: '2026-07-01', exit: '2026-07-30' },
  ...over,
});

const screenAll = (ks: Knobs[], over: Partial<ScreenContext> = {}) => {
  const c = ctx(over);
  const rows = ks.map((k) => screenCandidate(candidateFor(k), c));
  return peerPercentiles(applyVolatilityCap(rows).rows);
};

/** Ten plausible manufacturers, differing enough to produce a real ranking. */
const TEN: Knobs[] = Array.from({ length: 10 }, (_, i) => ({
  ticker: `T${String(i).padStart(2, '0')}`,
  seed: 11 + i * 7,
  qGrowth: 0.01 + i * 0.006,
  grossMargin: 0.35 + i * 0.03,
  operatingMargin: 0.12 + i * 0.02,
  netMargin: 0.08 + i * 0.012,
  ocfMultiple: 0.9 + i * 0.06,
  close: 40 + i * 12,
}));

/* ------------------------------------------------------------------ fundamentals per company */

describe('select — company figures', () => {
  it('builds every figure from the filings and records the tag each came from', () => {
    const f = companyFigures(candidateFor({ ticker: 'AAA' }), { asOf: T, close: 100 });
    expect(f.ok).toBe(true);
    expect(f.periodEnd).toBe('2026-03-31');
    expect(f.yearAgoEnd).toBe('2025-03-31');
    expect(f.tags!.revenue).toBe('RevenueFromContractWithCustomerExcludingAssessedTax');
    expect(f.tags!.netIncome).toBe('NetIncomeLoss');
    // Quarterly revenue compounds 3% a quarter, so a trailing year is 1.03^4 ahead of the prior one.
    expect(f.figures!.revenueGrowth).toBeCloseTo(1.03 ** 4 - 1, 10);
    expect(f.figures!.grossMargin).toBeCloseTo(0.55, 10);
    expect(f.figures!.cashConversion).toBeCloseTo(1.2, 10);
    expect(f.figures!.marketCap).toBe(100 * 1_000_000);
    expect(f.figures!.sharesAsOf).toBe('2026-03-31');
  });

  it('is ineligible, not neutral, when the company does not report revenue', () => {
    const f = companyFigures(
      candidateFor({ ticker: 'NOREV', omit: ['RevenueFromContractWithCustomerExcludingAssessedTax'] }),
      { asOf: T, close: 100 },
    );
    expect(f.ok).toBe(false);
    expect(f.reason).toMatch(/revenue/i);
    expect(f.figures).toBeUndefined();
  });

  it('drops a signal the filings do not support, and says why, instead of scoring it zero', () => {
    const f = companyFigures(candidateFor({ ticker: 'NOGP', omit: ['GrossProfit'] }), { asOf: T, close: 100 });
    expect(f.ok).toBe(true);
    expect(f.figures!.grossMarginTrend).toBeNull();
    expect(f.figures!.grossProfitability).toBeNull();
    expect(f.dropped!.map((d) => d.key)).toContain('grossMarginTrend');
    expect(f.dropped!.find((d) => d.key === 'grossProfitability')!.why).toMatch(/not reported/);
  });

  it('refuses to read cash conversion against a loss', () => {
    const f = companyFigures(candidateFor({ ticker: 'LOSS', netMargin: -0.1 }), { asOf: T, close: 100 });
    expect(f.figures!.cashConversion).toBeNull();
    expect(f.dropped!.find((d) => d.key === 'cashConversion')!.why).toMatch(/not positive/);
    // A negative earnings yield is a true statement and is kept; it simply sorts last.
    expect(f.figures!.earningsYield).toBeLessThan(0);
  });
});

/* ------------------------------------------------------------------ Stage A */

describe('select — Stage A eligibility', () => {
  it('admits a candidate that passes every test', () => {
    const row = screenCandidate(candidateFor({ ticker: 'OK' }), ctx());
    expect(row.eligible).toBe(true);
    expect(row.reason).toBeNull();
    expect(row.group).toBe('operating');
    expect(row.division).toBe('Manufacturing');
    expect(row.filing!.period).toBe('2026-03-31');
  });

  it('needs 253 sessions, and the boundary is exactly where the formulas put it', () => {
    // 12−1 momentum reads close[T−252] and close[T−21], so 253 observations are the minimum.
    expect(screenCandidate(candidateFor({ ticker: 'SHORT', sessions: 252 }), ctx()).reason).toMatch(/252 sessions of history/);
    expect(screenCandidate(candidateFor({ ticker: 'JUST', sessions: 253 }), ctx()).eligible).toBe(true);
  });

  it('removes penny stocks and illiquid stocks with the threshold named', () => {
    expect(screenCandidate(candidateFor({ ticker: 'CHEAP', close: 4 }), ctx()).reason).toMatch(/below \$5/);
    expect(screenCandidate(candidateFor({ ticker: 'THIN', volume: 1_000 }), ctx()).reason).toMatch(/below \$20M/);
  });

  it('removes a stock below its 200-session average', () => {
    const falling = candidateFor({ ticker: 'FALL' });
    falling.bars = makeBars(260, { drift: -0.002, seed: 3 });
    expect(screenCandidate(falling, ctx()).reason).toMatch(/below its 200-session average/);
  });

  it('removes a stock whose financials are too old to analyse', () => {
    const stale = candidateFor({ ticker: 'STALE' });
    expect(screenCandidate(stale, ctx({ T: '2026-12-31', asOf: '2026-12-31', calendar: sessionDates(260, '2026-12-31') })).reason).toMatch(
      /no bar for the decision session/,
    );
    const staleBars = { ...stale, bars: makeBars(260, { end: '2026-12-31', seed: 4 }) };
    const row = screenCandidate(staleBars, ctx({ T: '2026-12-31', asOf: '2026-12-31', calendar: sessionDates(260, '2026-12-31') }));
    expect(row.reason).toMatch(/period ending 2026-03-31, 275 days before/);
  });

  it('stands aside for two sessions after a results announcement', () => {
    const c = candidateFor({ ticker: 'JUSTREPORTED' });
    c.announcements = [{ date: T, accepted: `${T}T20:30:00.000Z`, accession: 'a', reportDate: T }];
    expect(screenCandidate(c, ctx()).reason).toMatch(/results were announced on 2026-06-30/);
    const dayBefore = { ...c, announcements: [{ date: '2026-06-29', accepted: '2026-06-29T20:30:00.000Z', accession: 'a', reportDate: null }] };
    expect(screenCandidate(dayBefore, ctx()).reason).toMatch(/inside the quiet window/);
    const longAgo = { ...c, announcements: [{ date: '2026-05-15', accepted: '2026-05-15T20:30:00.000Z', accession: 'a', reportDate: null }] };
    expect(screenCandidate(longAgo, ctx()).eligible).toBe(true);
  });

  it('respects the position and concentration limits', () => {
    const held = ctx({ openPositions: [{ ticker: 'OK', division: 'Manufacturing' }] });
    expect(screenCandidate(candidateFor({ ticker: 'OK' }), held).reason).toMatch(/already open/);
    const crowded = ctx({
      openPositions: [
        { ticker: 'A', division: 'Manufacturing' },
        { ticker: 'B', division: 'Manufacturing' },
        { ticker: 'C', division: 'Manufacturing' },
      ],
    });
    expect(screenCandidate(candidateFor({ ticker: 'D' }), crowded).reason).toMatch(/3 open positions already in Manufacturing/);
    const full = ctx({ openPositions: Array.from({ length: 21 }, (_, i) => ({ ticker: `X${i}`, division: 'Services' })) });
    expect(screenCandidate(candidateFor({ ticker: 'E' }), full).reason).toMatch(/all 21 position slots/);
  });

  it('removes an over-borrowed company, and never judges a bank on its cash flow statement', () => {
    const levered = candidateFor({ ticker: 'LEV', debt: 500_000, ocfMultiple: 0.2 });
    expect(screenCandidate(levered, ctx()).reason).toMatch(/× operating cash flow, above 6×/);
    // JPMorgan's trailing operating cash flow is −$211.8bn. That is a trading book, not distress, so
    // the test is not applied to finance at all.
    const bank = candidateFor({ ticker: 'BANK', sic: '6022', ocfMultiple: -3, omit: ['GrossProfit'] });
    expect(screenCandidate(bank, ctx({ sectorReturns: { '60': 0.04 } })).eligible).toBe(true);
    const operating = candidateFor({ ticker: 'BURN', ocfMultiple: -3 });
    expect(screenCandidate(operating, ctx()).reason).toMatch(/operating cash flow is negative/);
  });

  it('caps volatility against the day\'s own eligible set, not a fixed number', () => {
    const noisy = [...TEN, { ticker: 'WILD', seed: 99, amp: 0.06, close: 80 }];
    const rows = screenAll(noisy);
    const wild = rows.find((r) => r.ticker === 'WILD')!;
    expect(wild.eligible).toBe(false);
    expect(wild.reason).toMatch(/above the day's 85th percentile/);
    expect(rows.filter((r) => r.eligible).length).toBeGreaterThan(5);
  });
});

/* ------------------------------------------------------------------ Stage B */

describe('select — Stage B ranking', () => {
  it('scores every eligible candidate and lists the signals that produced the score', () => {
    const ranked = rankCandidates(screenAll(TEN));
    expect(ranked.length).toBeGreaterThan(5);
    const top = ranked[0];
    expect(top.signalsUsed).toContain('revenueGrowth');
    expect(top.signalsUsed).toContain('grossProfitability');
    expect(top.contributions.every((c) => Number.isFinite(c.z))).toBe(true);
    // The displayed score is a percentile among the eligible set and nothing else, so the candidate
    // with the highest composite scores 100. None of these fixtures is overextended, so the top of
    // the ranking is also the top composite.
    expect(ranked.some((r) => r.stretched)).toBe(false);
    expect(top.rankScore).toBe(100);
    expect(ranked.at(-1)!.rankScore).toBeLessThan(top.rankScore!);
  });

  it('scores a bank on the signals a bank has, without a neutral score for the ones it has not', () => {
    const banks: Knobs[] = Array.from({ length: 10 }, (_, i) => ({
      ticker: `B${String(i).padStart(2, '0')}`,
      sic: '6022',
      seed: 101 + i * 5,
      qGrowth: 0.01 + i * 0.005,
      netMargin: 0.1 + i * 0.01,
      close: 30 + i * 9,
      omit: ['GrossProfit'],
    }));
    const ranked = rankCandidates(peerPercentiles(applyVolatilityCap(
      banks.map((k) => screenCandidate(candidateFor(k), ctx({ sectorReturns: { '60': 0.04 } }))),
    ).rows));
    expect(ranked.length).toBeGreaterThan(5);
    const b = ranked[0];
    expect(b.group).toBe('finance');
    expect(b.signalsUsed).not.toContain('grossProfitability');
    expect(b.signalsUsed).not.toContain('grossMarginTrend');
    expect(b.signalsUsed).not.toContain('cashConversion');
    expect(b.signalsUsed).toContain('returnOnEquity');
    expect(b.signalsUsed).toContain('equityToAssets');
    expect(b.composite).not.toBe(0);
    expect(b.scoredAgainst).toMatch(/finance candidates/);
  });

  it('defines the signal set per sector group', () => {
    const operating = signalsForGroup('operating').map((s) => s.key);
    const finance = signalsForGroup('finance').map((s) => s.key);
    expect(operating).toContain('grossProfitability');
    expect(finance).not.toContain('grossProfitability');
    expect(finance).toContain('returnOnEquity');
    expect(operating).not.toContain('returnOnEquity');
    // Candidate signals stay out until the development window admits them.
    expect(signalsForGroup('operating').map((s) => s.key)).not.toContain('momentum12_1');
    expect(signalsForGroup('operating', { include: ['momentum12_1'] }).map((s) => s.key)).toContain('momentum12_1');
  });

  it('compares valuation within the candidate\'s own industry, and says when it had to widen', () => {
    const rows = screenAll(TEN);
    const r = rows.find((x) => x.eligible)!;
    expect(r.figures!.peerPercentile).toBeGreaterThanOrEqual(0);
    expect(r.peerBasis!.measure).toBe('free cash flow yield');
    expect(r.peerBasis!.against).toBe('SIC major group 36');
    const few = peerPercentiles(screenAll(TEN.slice(0, 3)));
    const widened = few.find((x) => x.eligible);
    if (widened) expect(widened.peerBasis!.widened).toBe(true);
  });

  it('ranks an overextended entry behind every candidate that is not overextended', () => {
    const rows = screenAll(TEN);
    const eligible = rows.filter((r) => r.eligible);
    // Force the strongest candidate to look stretched and confirm it loses its place.
    const strongest = rankCandidates(rows)[0].ticker;
    const nudged = rows.map((r) =>
      r.ticker === strongest ? { ...r, metrics: { ...r.metrics!, extension: 4.2 } } : r,
    );
    const ranked = rankCandidates(nudged);
    expect(ranked[0].ticker).not.toBe(strongest);
    const moved = ranked.find((r) => r.ticker === strongest)!;
    expect(moved.stretched).toBe(true);
    expect(moved.stretchedNote).toMatch(/4\.2 daily standard deviations/);
    expect(eligible.length).toBe(ranked.length);
  });
});

/* ------------------------------------------------------------------ the decision */

describe('select — the decision', () => {
  it('produces the same pick from the same inputs, twice', () => {
    const rows = screenAll(TEN);
    const a = decide(rows, { T });
    const b = decide(screenAll(TEN), { T });
    expect(a.pick!.ticker).toBe(b.pick!.ticker);
    expect(a.pick!.composite).toBeCloseTo(b.pick!.composite!, 12);
    expect(a.runnersUp.map((r) => r.ticker)).toEqual(b.runnersUp.map((r) => r.ticker));
  });

  it('names three runners-up so the card can say why this one beat them', () => {
    const d = decide(screenAll(TEN), { T });
    expect(d.runnersUp).toHaveLength(3);
    // Composite order holds among candidates that share a stretched flag; an overextended entry is
    // ranked behind the others whatever its composite, which is the one deliberate exception.
    expect(d.runnersUp.every((r) => r.stretched !== d.pick!.stretched || r.composite! <= d.pick!.composite!)).toBe(true);
    expect(d.eligible).toBeGreaterThan(3);
  });

  it('says "no qualifying pick today" with the binding reason, and never relaxes a threshold', () => {
    const allCheap = TEN.map((k) => ({ ...k, close: 3 }));
    const d = decide(screenAll(allCheap), { T, scanned: 4_735 });
    expect(d.pick).toBeNull();
    expect(d.eligible).toBe(0);
    expect(d.reason).toBe('no candidate passed the eligibility tests');
    expect(d.binding!.test).toBe('price');
    expect(d.binding!.reason).toMatch(/below \$5/);
    // Grouped by the test that fired, not by the sentence: each candidate's sentence carries its own
    // close, so counting the strings would report ten reasons of one each.
    expect(d.binding!.count).toBe(10);
    expect(d.scanned).toBe(4_735);
    // The threshold itself is untouched by the empty result.
    expect(LIMITS.minClose).toBe(5);
  });

  it('reports the single most common rejection when several tests fired', () => {
    const mixed = [
      ...TEN.slice(0, 3).map((k) => ({ ...k, close: 3 })),
      ...TEN.slice(3, 9).map((k) => ({ ...k, volume: 100 })),
    ];
    const d = decide(screenAll(mixed), { T });
    expect(d.pick).toBeNull();
    expect(d.binding!.test).toBe('liquidity');
    expect(d.binding!.reason).toMatch(/turnover/);
    expect(d.binding!.count).toBe(6);
  });
});
