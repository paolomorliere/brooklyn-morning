import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { StockFeed, StockRecap, StockRecapRow } from '@/types';
import { EARLY_SAMPLE, benchmarkPct, signed, trackRecord } from '@/lib/picks';

/**
 * The track record is arithmetic on rows the stocks build already measured, so the first check is that
 * it agrees with the build's own summary on the real published file. The rest pin the rules: only
 * finished picks count, "beat the market" and "made money" are different questions, versions never mix,
 * and a caution names a single pick only when that pick decides the direction.
 */

const feed = JSON.parse(readFileSync('public/data/stock.json', 'utf8')) as StockFeed;
const v2 = feed.recaps.find((r) => r.strategyVersion === 2)!;
const v1 = feed.recaps.find((r) => r.strategyVersion === 1)!;

const row = (o: Partial<StockRecapRow>): StockRecapRow => ({
  strategyVersion: 2,
  date: '2026-10-01',
  ticker: 'AAA',
  name: 'Aaa Inc.',
  status: 'complete',
  sessionsHeld: 21,
  horizon: 21,
  ...o,
});
const recap = (rows: StockRecapRow[]): StockRecap => ({
  kind: 'recap', strategyVersion: 2, asOf: '2026-11-20', rows,
  completed: 0, open: 0, meanNetPct: null, meanExcessSpyPct: null, meanExcessRspPct: null,
  winRate: null, mixedHorizonMeanPct: null, horizonsSpanned: [], note: '',
});

describe('against the published file', () => {
  const t = trackRecord(v2);

  it('counts exactly the positions the build counted', () => {
    expect(t.n).toBe(v2.completed);
    expect(t.running.filter((r) => r.row.status === 'open')).toHaveLength(v2.open);
  });

  it('reproduces the build’s averages, so the app adds no arithmetic of its own', () => {
    expect(t.meanNet).toBeCloseTo(v2.meanNetPct!, 9);
    expect(t.meanVsSpy).toBeCloseTo(v2.meanExcessSpyPct!, 9);
    // The build's `winRate` is "made money", not "beat the market".
    expect(t.madeMoney / t.n).toBeCloseTo(v2.winRate!, 9);
  });

  it('every row adds up: the pick minus the S&P 500 is the published excess', () => {
    for (const f of t.finished) expect(f.netPct - f.spyPct).toBeCloseTo(f.row.excessSpyPct!, 9);
  });

  it('lists a pick it could not price and does not count it', () => {
    const unpriced = v2.rows.filter((r) => r.status === 'unpriced');
    expect(t.unpriced.map((r) => r.ticker)).toEqual(unpriced.map((r) => r.ticker));
    for (const r of unpriced) expect(t.finished.some((f) => f.row === r)).toBe(false);
  });

  it('keeps version 1 entirely separate', () => {
    const one = trackRecord(v1);
    expect(one.strategyVersion).toBe(1);
    expect(one.finished.every((f) => f.row.strategyVersion === 1)).toBe(true);
    expect(t.finished.every((f) => f.row.strategyVersion === 2)).toBe(true);
  });

  it('puts the newest pick first in both lists', () => {
    const d = t.finished.map((f) => f.row.date);
    expect(d).toEqual([...d].sort().reverse());
    const r = t.running.map((x) => x.row.date);
    expect(r).toEqual([...r].sort().reverse());
  });
});

describe('the rules', () => {
  it('a running position is never in a figure, however well it is doing', () => {
    const t = trackRecord(recap([
      row({ ticker: 'DONE', netPct: -2, excessSpyPct: -1 }),
      row({ ticker: 'RUN', status: 'open', sessionsHeld: 9, netPct: 40, excessSpyPct: 45 }),
    ]));
    expect(t.n).toBe(1);
    expect(t.meanNet).toBe(-2);
    expect(t.running[0]).toMatchObject({ day: 9, of: 21, netPct: 40 });
  });

  it('a pick whose first session has not closed is running at day 0, with no return', () => {
    const t = trackRecord(recap([row({ ticker: 'NEW', status: 'not-entered', sessionsHeld: 0, netPct: null, excessSpyPct: null })]));
    expect(t.running[0]).toMatchObject({ day: 0, netPct: null, vsSpy: null });
    expect(t.verdict).toMatch(/No pick has finished/);
    expect(t.caution).toBeNull();
  });

  it('beat the market and made money are counted separately', () => {
    // Down 3% while the market fell 8%: lost money, beat the market.
    const t = trackRecord(recap([row({ netPct: -3, excessSpyPct: 5 })]));
    expect(t.beat).toBe(1);
    expect(t.madeMoney).toBe(0);
    expect(t.finished[0].spyPct).toBeCloseTo(-8, 9);
  });

  it('prefers the published S&P figure and falls back to the exact difference', () => {
    expect(benchmarkPct(row({ netPct: 2, excessSpyPct: 1, spyPct: 0.9 }))).toBe(0.9);
    expect(benchmarkPct(row({ netPct: 2, excessSpyPct: 1 }))).toBe(1);
    expect(benchmarkPct(row({ netPct: null, excessSpyPct: 1 }))).toBeNull();
  });

  it('says ahead, behind or level in words, with the size', () => {
    expect(trackRecord(recap([row({ netPct: 3, excessSpyPct: 2 })])).verdict).toMatch(/ahead of the market.*2\.0 points above/);
    expect(trackRecord(recap([row({ netPct: 1, excessSpyPct: -1 })])).verdict).toMatch(/behind the market.*1\.0 point below/);
    expect(trackRecord(recap([row({ netPct: 1, excessSpyPct: 0.01 })])).verdict).toMatch(/level with the market/);
  });

  it('names one pick only when taking it out flips the direction, and shows both figures', () => {
    const rows = [5, 4, 3, -40].map((x, i) => row({ ticker: `T${i}`, date: `2026-10-0${i + 1}`, netPct: x, excessSpyPct: x }));
    const t = trackRecord(recap(rows));
    expect(t.caution).toMatch(/without T3 \(−40\.0 points/);
    expect(t.caution).toMatch(/\+4\.0 points instead of −7\.0/);

    const steady = trackRecord(recap([1, 2, 3, 4].map((x, i) => row({ ticker: `S${i}`, netPct: x, excessSpyPct: x }))));
    expect(steady.caution).not.toMatch(/One pick decides/);
  });

  it('the small-sample caution goes away once the record is long enough', () => {
    const many = Array.from({ length: EARLY_SAMPLE }, (_, i) => row({ ticker: `M${i}`, netPct: 1, excessSpyPct: 1 }));
    expect(trackRecord(recap(many)).caution).toBeNull();
  });

  it('signs numbers with a real minus', () => {
    expect(signed(1.234)).toBe('+1.2');
    expect(signed(-35.5)).toBe('−35.5');
    expect(signed(0)).toBe('0.0');
  });
});

describe('the one line on the daily card', () => {
  it('keeps the reasons, verbatim, and drops the preamble', async () => {
    const { thesisLine } = await import('@/lib/picks');
    expect(
      thesisLine("Ranked first among today's eligible candidates on revenue growth, trailing year — revenue +39.9% over the trailing year, earnings fully backed by cash."),
    ).toBe('Revenue +39.9% over the trailing year, earnings fully backed by cash.');
  });
  it('shows any other thesis whole', async () => {
    const { thesisLine } = await import('@/lib/picks');
    const plain = 'This candidate ranked first on the balance of its signals, none of which stood out on its own.';
    expect(thesisLine(plain)).toBe(plain);
  });
  it('works on every thesis the build has published', async () => {
    const { thesisLine } = await import('@/lib/picks');
    const t = (feed.block as { thesis?: string }).thesis;
    if (t) {
      const line = thesisLine(t);
      expect(t.endsWith(line.charAt(0).toLowerCase() + line.slice(1))).toBe(true);
      expect(line.length).toBeLessThan(t.length);
    }
  });
});
