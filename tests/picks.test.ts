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

describe('if you had done what the card said', () => {
  const card = (o: Partial<StockRecapRow>) =>
    row({ cardBuy: '2026-10-01', cardSell: '2026-10-29', entryDate: '2026-10-01', valueDate: '2026-10-29', publishedAt: '2026-10-01T10:00:00.000Z', ...o });

  it('turns each return into dollars on $1,000, and totals finished and open separately', async () => {
    const { STAKE } = await import('@/lib/picks');
    const t = trackRecord(recap([
      card({ ticker: 'A', netPct: 12, excessSpyPct: 10 }),
      card({ ticker: 'B', netPct: -2, excessSpyPct: 4 }),
      row({ ticker: 'R', status: 'open', sessionsHeld: 5, netPct: 50, excessSpyPct: 58, cardBuy: '2026-11-02', cardSell: '2026-12-01', entryDate: '2026-11-02' }),
      row({ ticker: 'N', status: 'not-entered', sessionsHeld: 0, netPct: null, excessSpyPct: null, cardBuy: '2026-11-23', cardSell: '2026-12-21' }),
    ]));
    expect(STAKE).toBe(1000);
    expect(t.finished.map((f) => Math.round(f.dollars))).toEqual(expect.arrayContaining([120, -20]));
    expect(t.money.finished).toEqual({ n: 2, total: 100, made: 1, lost: 1 });
    // The open pick is its own figure, and the one with no close yet is waiting, not zero.
    expect(t.money.running).toEqual({ n: 1, total: 500, up: 1, down: 0, waiting: 1 });
    expect(t.running.find((r) => r.row.ticker === 'N')?.dollars).toBeNull();
  });

  it('says exact when the record bought and sold on the card’s own days', async () => {
    const { cardFollow } = await import('@/lib/picks');
    expect(cardFollow(card({}))).toEqual({ kind: 'exact' });
  });

  it('says late when the card was published after its own buy day’s open — the ATEX case', async () => {
    const { cardFollow } = await import('@/lib/picks');
    // Published at 18:20 New York on 6 October; the card still said "buy at the open on 6 October".
    const atex = card({ cardBuy: '2026-10-06', cardSell: '2026-11-03', publishedAt: '2026-10-06T22:20:59.688Z', entryDate: '2026-10-07', valueDate: '2026-11-04' });
    expect(cardFollow(atex)).toEqual({ kind: 'late', publishedAt: '2026-10-06T22:20:59.688Z' });
    // Published before that open: the card could be followed, so a different measured day is a plain difference.
    const early = card({ cardBuy: '2026-10-06', cardSell: '2026-11-03', publishedAt: '2026-10-06T12:00:00.000Z', entryDate: '2026-10-07', valueDate: '2026-11-04' });
    expect(cardFollow(early)).toEqual({ kind: 'differs' });
  });

  it('has nothing to follow when the card gave no sell day', async () => {
    const { cardFollow } = await import('@/lib/picks');
    expect(cardFollow(row({ strategyVersion: 1, cardBuy: null, cardSell: null }))).toEqual({ kind: 'no-dates' });
  });

  it('on the published record, every finished card was followed exactly except ATEX', async () => {
    const { cardFollow } = await import('@/lib/picks');
    const log = JSON.parse(readFileSync('state/stocks-v2.json', 'utf8')) as { picks: { date: string; ticker: string; publishedAt: string; cardBuy: string; cardSell: string }[] };
    const byKey = new Map(log.picks.map((p) => [p.date + p.ticker, p]));
    const kinds = v2.rows
      .filter((r) => r.status === 'complete')
      .map((r) => {
        const p = byKey.get(r.date + r.ticker)!;
        return [r.ticker, cardFollow({ ...r, publishedAt: p.publishedAt, cardBuy: p.cardBuy, cardSell: p.cardSell }).kind] as const;
      });
    expect(kinds.filter(([, k]) => k !== 'exact')).toEqual([['ATEX', 'late']]);
  });

  it('writes dollars with a real minus and thousands separators', async () => {
    const { usd } = await import('@/lib/picks');
    expect(usd(176.6)).toBe('+$177');
    expect(usd(-1053.2)).toBe('−$1,053');
    expect(usd(0.2)).toBe('$0');
  });
});
