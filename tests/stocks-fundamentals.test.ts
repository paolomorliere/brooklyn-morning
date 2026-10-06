import { describe, expect, it } from 'vitest';
import {
  acceptedToIso,
  allTags,
  chooseInstantTag,
  chooseQuarterlyTag,
  collectFacts,
  daysBetween,
  digestSubmissions,
  instantSeries,
  latestEnd,
  latestFinancialFiling,
  quarterlySeries,
  seriesFor,
  sectorGroupOf,
  sicDivision,
  sicMajorGroup,
  ttmAt,
  ymdToIso,
} from '../scripts/lib/fundamentals.mjs';
import type { Fact, Submission } from '../scripts/lib/fundamentals.mjs';

/* ------------------------------------------------------------------ fixtures */

const SUB_COLS = ['adsh', 'cik', 'name', 'sic', 'form', 'period', 'fy', 'fp', 'filed', 'accepted', 'prevrpt'];
const NUM_COLS = ['adsh', 'tag', 'version', 'ddate', 'qtrs', 'uom', 'segments', 'coreg', 'value', 'footnote'];

const tsv = (cols: string[], rows: Record<string, string | number>[]) =>
  [cols.join('\t'), ...rows.map((r) => cols.map((c) => String(r[c] ?? '')).join('\t'))].join('\n');

type SubSpec = { adsh: string; form: string; period: string; fy: string; fp: string; accepted: string; prevrpt?: 0 | 1; cik?: string; sic?: string };

const subRow = (s: SubSpec) => ({
  adsh: s.adsh,
  cik: s.cik ?? '1',
  name: 'TESTCO INC',
  sic: s.sic ?? '3674',
  form: s.form,
  period: s.period,
  fy: s.fy,
  fp: s.fp,
  filed: s.accepted.slice(0, 8),
  accepted: `${s.accepted.slice(0, 4)}-${s.accepted.slice(4, 6)}-${s.accepted.slice(6, 8)} 16:30:00.0`,
  prevrpt: s.prevrpt ?? 0,
});

/**
 * One calendar-quarter filer, built to contain every awkward pattern the real datasets contain:
 * 10-Qs that publish the standalone quarter *and* the year to date, a 10-K that publishes only the
 * year, a later amendment, a segment row, and a figure reported in euros.
 *
 * Quarterly revenue, with the two fourth quarters implied rather than stated:
 *   2024: 80, 85, 85, 90 (annual 340)   2025: 100, 110, 120, 130 (annual 460)   2026: 140, 150
 */
const SUBS: SubSpec[] = [
  { adsh: 'q1-24', form: '10-Q', period: '2024-03-31', fy: '2024', fp: 'Q1', accepted: '20240501' },
  { adsh: 'q2-24', form: '10-Q', period: '2024-06-30', fy: '2024', fp: 'Q2', accepted: '20240801' },
  { adsh: 'q3-24', form: '10-Q', period: '2024-09-30', fy: '2024', fp: 'Q3', accepted: '20241101' },
  { adsh: 'fy-24', form: '10-K', period: '2024-12-31', fy: '2024', fp: 'FY', accepted: '20250215' },
  { adsh: 'q1-25', form: '10-Q', period: '2025-03-31', fy: '2025', fp: 'Q1', accepted: '20250501' },
  { adsh: 'q2-25', form: '10-Q', period: '2025-06-30', fy: '2025', fp: 'Q2', accepted: '20250801' },
  { adsh: 'q3-25', form: '10-Q', period: '2025-09-30', fy: '2025', fp: 'Q3', accepted: '20251101' },
  { adsh: 'fy-25', form: '10-K', period: '2025-12-31', fy: '2025', fp: 'FY', accepted: '20260215' },
  { adsh: 'q1-26', form: '10-Q', period: '2026-03-31', fy: '2026', fp: 'Q1', accepted: '20260501' },
  { adsh: 'q2-26', form: '10-Q', period: '2026-06-30', fy: '2026', fp: 'Q2', accepted: '20260801' },
  { adsh: 'q2-26a', form: '10-Q/A', period: '2026-06-30', fy: '2026', fp: 'Q2', accepted: '20260910' },
  { adsh: 'ignore-me', form: '8-K', period: '2026-08-19', fy: '2026', fp: 'Q3', accepted: '20260819' },
];

const REV = 'RevenueFromContractWithCustomerExcludingAssessedTax';

/** Eight consecutive quarter ends from 2018 — complete, unbroken, and eight years out of date. */
const QUARTER_ENDS = [
  '2017-03-31', '2017-06-30', '2017-09-30', '2017-12-31',
  '2018-03-31', '2018-06-30', '2018-09-30', '2018-12-31',
];

const num = (adsh: string, tag: string, ddate: string, qtrs: number, value: number, over: Record<string, string> = {}) => ({
  adsh,
  tag,
  version: 'us-gaap/2026',
  ddate: ddate.replace(/-/g, ''),
  qtrs,
  uom: 'USD',
  segments: '',
  coreg: '',
  value,
  footnote: '',
  ...over,
});

const NUMS = [
  // 2024 — quarters stated, the year stated, the fourth quarter left implied.
  num('q1-24', REV, '2024-03-31', 1, 80),
  num('q2-24', REV, '2024-06-30', 1, 85),
  num('q2-24', REV, '2024-06-30', 2, 165),
  num('q3-24', REV, '2024-09-30', 1, 85),
  num('q3-24', REV, '2024-09-30', 3, 250),
  num('fy-24', REV, '2024-12-31', 4, 340),
  // 2025 — the same shape. Note q3-25 carries both qtrs=1 and qtrs=3, like Microsoft's Q3 10-Q:
  // adding those two together would give 450 instead of 120 for the quarter.
  num('q1-25', REV, '2025-03-31', 1, 100),
  num('q2-25', REV, '2025-06-30', 1, 110),
  num('q2-25', REV, '2025-06-30', 2, 210),
  num('q3-25', REV, '2025-09-30', 1, 120),
  num('q3-25', REV, '2025-09-30', 3, 330),
  num('fy-25', REV, '2025-12-31', 4, 460),
  // 2026, with an amendment restating the second quarter from 150 to 155.
  num('q1-26', REV, '2026-03-31', 1, 140),
  num('q2-26', REV, '2026-06-30', 1, 150),
  num('q2-26a', REV, '2026-06-30', 1, 155),
  // Noise that must never reach a signal: a segment, a co-registrant and a euro figure.
  num('q2-26', REV, '2026-06-30', 1, 999, { segments: 'Americas' }),
  num('q2-26', REV, '2026-06-30', 1, 888, { coreg: 'SUBCO' }),
  num('q2-26', REV, '2026-06-30', 1, 777, { uom: 'EUR' }),
  // `Revenues` exists, but only for the two most recent quarters — not enough to rank on.
  num('q1-26', 'Revenues', '2026-03-31', 1, 142),
  num('q2-26', 'Revenues', '2026-06-30', 1, 152),
  // Instant figures.
  num('q2-26', 'Assets', '2026-06-30', 0, 5_000),
  num('q2-26', 'EntityCommonStockSharesOutstanding', '2026-06-30', 0, 400, { uom: 'shares' }),
];

/** The amendment supersedes the original, so the dataset flags the original as a previous report. */
const subsWithPrevrpt = SUBS.map((s) => (s.adsh === 'q2-26' ? { ...s, prevrpt: 1 as const } : s));

const build = (asOf: string, subs: SubSpec[] = subsWithPrevrpt) => {
  const { byAdsh, byCik } = digestSubmissions(tsv(SUB_COLS, subs.map(subRow)));
  const facts = collectFacts(tsv(NUM_COLS, NUMS), byAdsh, { tags: allTags() });
  return { facts, byAdsh, byCik, asOf };
};

/* ------------------------------------------------------------------ dates */

describe('fundamentals — dates', () => {
  it('reads the SEC\'s eight-digit dates', () => {
    expect(ymdToIso('20260801')).toBe('2026-08-01');
    expect(ymdToIso('2026-08-01')).toBeNull();
    expect(ymdToIso('')).toBeNull();
  });

  it('reads `accepted` as Eastern time and never makes a filing knowable earlier than it was', () => {
    // 18:30 in New York is 22:30 UTC. A naive parse would call it 18:30 UTC and let a 20:00 UTC
    // cutoff see a filing that had not yet been accepted.
    expect(acceptedToIso('2026-08-19 18:30:00.0')).toBe('2026-08-19T22:30:00.000Z');
    expect(acceptedToIso('2026-08-19 06:00:00.0')).toBe('2026-08-19T10:00:00.000Z');
    expect(acceptedToIso('nonsense')).toBeNull();
  });

  it('counts whole days between period ends', () => {
    expect(daysBetween('2026-03-31', '2026-06-30')).toBe(91);
    expect(daysBetween('2025-06-30', '2026-06-30')).toBe(365);
  });
});

/* ------------------------------------------------------------------ parsing */

describe('fundamentals — parsing the datasets', () => {
  it('keeps only the forms that carry financial statements', () => {
    const { byAdsh, byCik } = digestSubmissions(tsv(SUB_COLS, SUBS.map(subRow)));
    expect(byAdsh.has('ignore-me')).toBe(false);
    expect(byAdsh.size).toBe(SUBS.length - 1);
    expect(byCik.get('1')!.map((s) => s.adsh)).toEqual([
      'q1-24', 'q2-24', 'q3-24', 'fy-24', 'q1-25', 'q2-25', 'q3-25', 'fy-25', 'q1-26', 'q2-26', 'q2-26a',
    ]);
  });

  it('drops segment rows, co-registrant rows and anything unparseable', () => {
    const { facts } = build('2026-12-31');
    const q2 = facts.filter((f) => f.ddate === '2026-06-30' && f.tag === REV && f.qtrs === 1);
    expect(q2.map((f) => f.value).sort((a, b) => a - b)).toEqual([150, 155, 777]);
    expect(q2.some((f) => f.value === 999 || f.value === 888)).toBe(false);
  });

  it('ignores a figure reported in another currency rather than mixing it in', () => {
    const { facts, asOf } = build('2026-12-31');
    const usd = seriesFor(facts, { tag: REV, qtrs: 1, uom: 'USD', asOf });
    expect(usd.get('2026-06-30')!.value).toBe(155);
    const eur = seriesFor(facts, { tag: REV, qtrs: 1, uom: 'EUR', asOf });
    expect(eur.get('2026-06-30')!.value).toBe(777);
  });
});

/* ------------------------------------------------------------------ point in time */

describe('fundamentals — point in time', () => {
  it('never uses a fact accepted after the cutoff', () => {
    const before = build('2026-08-15');
    const series = quarterlySeries(before.facts, { tag: REV, asOf: before.asOf });
    expect(series.has('2026-06-30')).toBe(true);
    const after = build('2026-05-15');
    expect(quarterlySeries(after.facts, { tag: REV, asOf: after.asOf }).has('2026-06-30')).toBe(false);
  });

  it('prefers the amendment once it exists, and the original before it does', () => {
    const early = build('2026-08-15');
    expect(quarterlySeries(early.facts, { tag: REV, asOf: early.asOf }).get('2026-06-30')!.value).toBe(150);
    const late = build('2026-09-30');
    const point = quarterlySeries(late.facts, { tag: REV, asOf: late.asOf }).get('2026-06-30')!;
    expect(point.value).toBe(155);
    expect(point.adsh).toBe('q2-26a');
  });

  it('uses a superseded filing only while nothing has replaced it', () => {
    // The original is flagged `prevrpt`, but on 15 August it was the only thing on file. Dropping
    // flagged rows outright would leave a hole where a published figure actually was.
    const early = build('2026-08-15');
    expect(quarterlySeries(early.facts, { tag: REV, asOf: early.asOf }).get('2026-06-30')!.adsh).toBe('q2-26');
  });
});

/* ------------------------------------------------------------------ TTM */

describe('fundamentals — trailing twelve months', () => {
  it('reads the standalone quarter, not the year-to-date total, when a filing carries both', () => {
    const { facts, asOf } = build('2026-12-31');
    const series = quarterlySeries(facts, { tag: REV, asOf });
    expect(series.get('2025-09-30')!.value).toBe(120);
    expect(series.get('2025-09-30')!.derived).toBe(false);
  });

  it('recovers the fourth quarter the 10-K leaves implied', () => {
    const { facts, asOf } = build('2026-12-31');
    const q4 = quarterlySeries(facts, { tag: REV, asOf }).get('2025-12-31')!;
    expect(q4.value).toBe(130); // 460 for the year less 330 through three quarters
    expect(q4.derived).toBe(true);
    expect(q4.qtrs).toBe(1);
    expect(q4.derivedFrom).toEqual({ ytd: 'fy-25', base: 'q3-25', qtrs: 4 });
  });

  it('derives the fourth quarter even when the two halves carry different fiscal-year labels', () => {
    // `companyfacts` labels a fact with the fiscal year of the filing it appeared in, not of the period
    // it covers, so a prior-year quarter restated as a comparative carries the *later* year. An
    // explicit fiscal-year check looked like a safety net and silently blocked the fourth quarter of
    // every such year — and with it every trailing-year figure. The durations already pin the year:
    // four quarters ending here, less three ending one quarter earlier, is the quarter in between.
    const relabelled = SUBS.map((x) => (x.adsh === 'q3-25' ? { ...x, fy: '2026' } : x));
    const { byAdsh } = digestSubmissions(tsv(SUB_COLS, relabelled.map(subRow)));
    const facts = collectFacts(tsv(NUM_COLS, NUMS), byAdsh, { tags: allTags() });
    const q4 = quarterlySeries(facts, { tag: REV, asOf: '2026-12-31' }).get('2025-12-31')!;
    expect(q4.value).toBe(130);
    expect(q4.derived).toBe(true);
  });

  it('sums four single quarters and never a mixed set of durations', () => {
    const { facts, asOf } = build('2026-12-31');
    const series = quarterlySeries(facts, { tag: REV, asOf });
    const ttm = ttmAt(series, '2025-12-31')!;
    expect(ttm.value).toBe(460);
    expect(ttm.quarters).toEqual(['2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31']);
    // The mistake this guards against: 120 + 330 for the third quarter would make the year 670.
    expect(ttm.value).not.toBe(670);
    expect(ttmAt(series, '2026-06-30')!.value).toBe(545); // 155 + 140 + 130 + 120
  });

  it('refuses to present three quarters as a year', () => {
    const { facts, asOf } = build('2026-12-31');
    const series = quarterlySeries(facts, { tag: REV, asOf });
    series.delete('2025-06-30');
    expect(ttmAt(series, '2025-12-31')).toBeNull();
  });

  it('returns null rather than a partial year before the fourth quarter is knowable', () => {
    // On 15 January 2026 the 10-K had not been accepted, so there is no fourth quarter at all.
    const { facts, asOf } = build('2026-01-15');
    const series = quarterlySeries(facts, { tag: REV, asOf });
    expect(series.has('2025-12-31')).toBe(false);
    expect(ttmAt(series, '2025-12-31')).toBeNull();
    expect(ttmAt(series, '2025-09-30')!.value).toBe(420); // 120 + 110 + 100 + 90
  });
});

/* ------------------------------------------------------------------ tag choice */

describe('fundamentals — choosing a tag', () => {
  it('falls through to the tag that has enough history, and says which it used', () => {
    const { facts, asOf } = build('2026-12-31');
    const chosen = chooseQuarterlyTag(facts, ['Revenues', REV], { asOf, quarters: 8 })!;
    // `Revenues` exists, but only for two quarters — not a series a year-on-year figure can use.
    expect(chosen.tag).toBe(REV);
    expect(chosen.end).toBe('2026-06-30');
  });

  it('takes the first preference when it does have the history', () => {
    const { facts, asOf } = build('2026-12-31');
    expect(chooseQuarterlyTag(facts, ['Revenues', REV], { asOf, quarters: 2 })!.tag).toBe('Revenues');
  });

  it('will not choose a tag the company stopped using, however long its history', () => {
    // Analog Devices reported `Revenues` until its 2018 fiscal year and ASC 606 contract revenue after
    // that. The old series is eight unbroken quarters long, so a preference order that only checked
    // "is there enough history" picked it, and every figure on the card described a company eight years
    // out of date. The series has to be current as well as complete.
    const stale = SUBS.filter((x) => x.form !== '8-K').map((x) => subRow(x));
    const oldTagRows = QUARTER_ENDS.map((d, i) => num(`q-${d}`, 'Revenues', d, 1, 50 + i));
    const oldSubs = QUARTER_ENDS.map((d) => subRow({ adsh: `q-${d}`, form: '10-Q', period: d, fy: d.slice(0, 4), fp: 'Q', accepted: d.replace(/-/g, '') }));
    const { byAdsh } = digestSubmissions(tsv(SUB_COLS, [...stale, ...oldSubs]));
    const facts = collectFacts(tsv(NUM_COLS, [...NUMS, ...oldTagRows]), byAdsh, { tags: allTags() });
    const chosen = chooseQuarterlyTag(facts, ['Revenues', REV], { asOf: '2026-12-31', quarters: 8 })!;
    expect(chosen.tag).toBe(REV);
    expect(chosen.end).toBe('2026-06-30');
    // And with no fresh alternative, the answer is nothing rather than the stale series.
    const onlyStale = collectFacts(tsv(NUM_COLS, oldTagRows), byAdsh, { tags: allTags() });
    expect(chooseQuarterlyTag(onlyStale, ['Revenues'], { asOf: '2026-12-31', quarters: 8 })).toBeNull();
  });

  it('returns null when no tag in the order works, rather than inventing a zero', () => {
    const { facts, asOf } = build('2026-12-31');
    expect(chooseQuarterlyTag(facts, ['GrossProfit'], { asOf })).toBeNull();
  });

  it('reads instant figures in their own unit of measure', () => {
    const { facts, asOf } = build('2026-12-31');
    expect(chooseInstantTag(facts, ['Assets'], { asOf })!.fact.value).toBe(5_000);
    const shares = chooseInstantTag(facts, ['EntityCommonStockSharesOutstanding'], { asOf, uom: 'shares' })!;
    expect(shares.fact.value).toBe(400);
    expect(latestEnd(instantSeries(facts, { tag: 'Assets', asOf }))).toBe('2026-06-30');
  });
});

/* ------------------------------------------------------------------ sectors */

describe('fundamentals — sector groups', () => {
  it('separates the groups whose tag coverage differs', () => {
    expect(sectorGroupOf('3674')).toBe('operating');
    expect(sectorGroupOf('6022')).toBe('finance'); // state commercial bank
    expect(sectorGroupOf('6798')).toBe('finance'); // REIT
    expect(sectorGroupOf('6311')).toBe('finance'); // life insurance
    expect(sectorGroupOf('4911')).toBe('utilities');
    expect(sectorGroupOf('1311')).toBe('energy'); // crude petroleum and natural gas
    expect(sectorGroupOf('2911')).toBe('energy'); // petroleum refining
    expect(sectorGroupOf('')).toBe('operating');
  });

  it('names the SIC division used for the concentration cap', () => {
    expect(sicDivision('3674')).toBe('Manufacturing');
    expect(sicDivision('6022')).toBe('Finance, Insurance and Real Estate');
    expect(sicDivision('4911')).toBe('Transportation, Communications and Utilities');
    expect(sicDivision('7372')).toBe('Services');
    expect(sicDivision('')).toBe('Unclassified');
  });

  it('gives the two-digit major group peers are compared within', () => {
    expect(sicMajorGroup('3674')).toBe('36');
    expect(sicMajorGroup('700')).toBe('07');
    expect(sicMajorGroup('')).toBeNull();
  });
});

describe('fundamentals — most recent filing', () => {
  it('takes the latest acceptance at or before the cutoff', () => {
    const { byCik } = build('2026-12-31');
    const subs = byCik.get('1') as unknown as Submission[];
    expect(latestFinancialFiling(subs, '2026-12-31')!.adsh).toBe('q2-26a');
    expect(latestFinancialFiling(subs, '2026-08-15')!.adsh).toBe('q2-26');
    expect(latestFinancialFiling(subs, '2024-01-01')).toBeNull();
    expect(latestFinancialFiling([], '2026-12-31')).toBeNull();
  });
});

describe('fundamentals — the fact shape', () => {
  it('carries provenance on every point, because the card has to cite it', () => {
    const { facts, asOf } = build('2026-12-31');
    const point = quarterlySeries(facts, { tag: REV, asOf }).get('2026-03-31')!;
    const expected: Partial<Fact> = { adsh: 'q1-26', form: '10-Q', tag: REV };
    expect(point).toMatchObject(expected);
    expect(point.accepted).toBe('2026-05-01T20:30:00.000Z');
  });
});
