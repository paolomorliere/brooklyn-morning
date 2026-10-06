import { describe, expect, it } from 'vitest';
import {
  aboveTrend,
  adjustedDividends,
  barAtOrBefore,
  clip,
  dividendsBetween,
  extension,
  indexOfDate,
  medianDollarVolume,
  median,
  momentum12_1,
  percentileOf,
  quantile,
  realisedVol,
  returnBetween,
  sma,
  stdev,
  totalReturn,
  trailingReturn,
  winsorize,
  zScores,
} from '../scripts/lib/signals.mjs';

/** `n` sessions of consecutive dates from a start date, with a close generator. */
const series = (n: number, closeAt: (i: number) => number, volumeAt: (i: number) => number = () => 1_000_000) => {
  const out = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const c = closeAt(i);
    out.push({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      open: c,
      high: c,
      low: c,
      close: c,
      volume: volumeAt(i),
    });
  }
  return out;
};

describe('signals — statistics', () => {
  it('computes the ordinary summaries', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3); // sample, n−1
    expect(stdev([1])).toBeNull();
    expect(clip(5, 0, 3)).toBe(3);
  });

  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([10], 0.85)).toBe(10);
  });

  it('pulls extremes in instead of letting one of them flatten the rest', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000];
    const w = winsorize(values, 0.1);
    expect(Math.max(...w.values)).toBeLessThan(1000);
    expect(w.trimmed).toBeGreaterThan(0);
    // Below five observations there is nothing to trim against, so nothing is trimmed.
    expect(winsorize([1, 1000], 0.1).values).toEqual([1, 1000]);
  });

  it('z-scores a candidate set, and gives no information when every value is the same', () => {
    const { z } = zScores([1, 2, 3, 4, 5]);
    expect(z[2]).toBeCloseTo(0, 10);
    expect(z[4]).toBeGreaterThan(0);
    const flatZ = zScores([7, 7, 7, 7, 7]);
    expect(flatZ.z).toEqual([0, 0, 0, 0, 0]);
    expect(flatZ.sd).toBe(0);
  });

  it('places a value among its peers', () => {
    expect(percentileOf([1, 2, 3, 4], 3)).toBe(0.75);
    expect(percentileOf([], 1)).toBeNull();
  });
});

describe('signals — bars', () => {
  it('finds bars by date', () => {
    const bars = series(5, (i) => 100 + i);
    expect(indexOfDate(bars, bars[3].date)).toBe(3);
    expect(indexOfDate(bars, '1999-01-01')).toBe(-1);
    expect(barAtOrBefore(bars, bars[2].date)!.close).toBe(102);
    expect(barAtOrBefore(bars, '1999-01-01')).toBeNull();
  });

  it('averages the last n closes, and refuses when there are not n of them', () => {
    const bars = series(5, () => 100);
    expect(sma(bars, 5)).toBe(100);
    expect(sma(bars, 6)).toBeNull();
    expect(sma(series(3, (i) => [10, 20, 30][i]), 3)).toBe(20);
  });

  it('measures liquidity as the median, so one heavy day cannot carry a thin stock', () => {
    const bars = series(5, () => 10, (i) => (i === 4 ? 100_000_000 : 1_000));
    expect(medianDollarVolume(bars, 5)).toBe(10_000);
    expect(medianDollarVolume(bars, 9)).toBeNull();
  });

  it('needs n+1 bars for n daily returns', () => {
    const bars = series(61, (i) => 100 * 1.001 ** i);
    expect(realisedVol(bars, 60)).not.toBeNull();
    expect(realisedVol(bars.slice(0, 60), 60)).toBeNull();
    // A perfectly steady compounding series has identical log returns, so no dispersion at all.
    expect(realisedVol(bars, 60)!.daily).toBeCloseTo(0, 12);
  });
});

describe('signals — corporate actions', () => {
  it('restates a pre-split dividend in current share terms', () => {
    const divs = adjustedDividends(
      [
        { ex_dividend_date: '2026-02-07', cash_amount: 0.88 },
        { ex_dividend_date: '2026-05-08', cash_amount: 0.25 },
      ],
      [{ execution_date: '2026-03-02', split_from: 1, split_to: 4 }],
    );
    expect(divs[0]).toMatchObject({ exDate: '2026-02-07', amount: 0.22, gross: 0.88, splitFactor: 4 });
    expect(divs[1]).toMatchObject({ exDate: '2026-05-08', amount: 0.25, splitFactor: 1 });
  });

  it('reproduces a hand-computed total return across a split and two dividends', () => {
    // Bars are split-adjusted: 50.00 on 2 January, 60.00 on 30 June. The owner collects $0.22 and
    // $0.25 in current share terms, so (60.00 + 0.47) / 50.00 − 1 = 20.94%.
    const divs = adjustedDividends(
      [
        { ex_dividend_date: '2026-02-07', cash_amount: 0.88 },
        { ex_dividend_date: '2026-05-08', cash_amount: 0.25 },
      ],
      [{ execution_date: '2026-03-02', split_from: 1, split_to: 4 }],
    );
    const r = totalReturn({ fromPrice: 50, toPrice: 60, from: '2026-01-02', to: '2026-06-30', dividends: divs })!;
    expect(r).toBeCloseTo(60.47 / 50 - 1, 12);
    expect(r).toBeCloseTo(0.2094, 6);
    // The price-only return is visibly smaller — this is the gap that penalises income stocks.
    expect(totalReturn({ fromPrice: 50, toPrice: 60, from: '2026-01-02', to: '2026-06-30' })!).toBeCloseTo(0.2, 12);
  });

  it('counts a dividend for the holder who owned the stock before it went ex', () => {
    const divs = [
      { exDate: '2026-01-02', amount: 1, gross: 1, splitFactor: 1 },
      { exDate: '2026-03-02', amount: 2, gross: 2, splitFactor: 1 },
      { exDate: '2026-06-30', amount: 3, gross: 3, splitFactor: 1 },
    ];
    // Buying at the 2 January price means buying on the ex-date, which does not entitle you to it.
    expect(dividendsBetween(divs, '2026-01-02', '2026-06-30').map((d) => d.amount)).toEqual([2, 3]);
  });

  it('ignores malformed corporate-action rows instead of turning them into zeros', () => {
    expect(adjustedDividends([{ ex_dividend_date: 'soon', cash_amount: 1 }], [])).toEqual([]);
    expect(adjustedDividends([{ ex_dividend_date: '2026-01-02', cash_amount: 'x' }] as never, [])).toEqual([]);
  });
});

describe('signals — price signals', () => {
  it('measures 12−1 momentum over the right window and skips the last month', () => {
    // 300 sessions rising 0.1% a day. The 12−1 window is index 47 to 278 inclusive.
    const bars = series(300, (i) => 100 * 1.001 ** i);
    const m = momentum12_1(bars)!;
    expect(m).toBeCloseTo(1.001 ** (278 - 47) - 1, 10);
    // The last 21 sessions are deliberately excluded, so the figure is not the full-period return.
    expect(m).not.toBeCloseTo(returnBetween(bars, 47, 299)!, 6);
    expect(momentum12_1(series(252, () => 100))).toBeNull();
  });

  it('measures a trailing return and refuses when the history is too short', () => {
    const bars = series(130, (i) => 100 + i);
    expect(trailingReturn(bars, 126)!).toBeCloseTo(229 / 103 - 1, 10); // close 229 against close 103
    expect(trailingReturn(bars, 200)).toBeNull();
  });

  it('expresses extension in daily standard deviations', () => {
    // 60 flat sessions, then a jump: the deviation above the 50-session average is large relative to
    // a volatility measured on a series that barely moved, which is exactly the signal.
    const bars = series(70, (i) => (i < 60 ? 100 + (i % 2) * 0.5 : 110));
    const e = extension(bars)!;
    expect(e).toBeGreaterThan(3);
    expect(extension(series(40, () => 100))).toBeNull();
  });

  it('answers the trend filter only when 200 sessions exist', () => {
    expect(aboveTrend(series(210, (i) => 100 + i))).toBe(true);
    expect(aboveTrend(series(210, (i) => 400 - i))).toBe(false);
    expect(aboveTrend(series(199, () => 100))).toBeNull();
  });
});
