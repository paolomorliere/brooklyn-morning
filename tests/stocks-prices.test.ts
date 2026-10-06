import { describe, expect, it } from 'vitest';
import {
  AllowanceExhausted,
  FREE_REQUESTS_PER_MINUTE,
  RateLimiter,
  barsPath,
  encodeBarsCsv,
  parseBarsCsv,
  parseDividends,
  parseGroupedBars,
  parseSplits,
  seriesByTicker,
} from '../scripts/lib/prices.mjs';

describe('prices — reading the feed', () => {
  it('expands the single-letter keys and sorts by ticker', () => {
    const rows = parseGroupedBars({
      results: [
        { T: 'msft', o: 400, h: 410, l: 398, c: 405, v: 12_000_000 },
        { T: 'AAPL', o: 200, h: 205, l: 199, c: 204, v: 50_000_000 },
      ],
    });
    expect(rows.map((r) => r.ticker)).toEqual(['AAPL', 'MSFT']);
    expect(rows[1]).toEqual({ ticker: 'MSFT', open: 400, high: 410, low: 398, close: 405, volume: 12_000_000 });
  });

  it('drops a row with no usable price rather than recording a zero', () => {
    const rows = parseGroupedBars({
      results: [
        { T: 'GOOD', o: 10, c: 11, v: 1 },
        { T: 'NOOPEN', c: 11, v: 1 },
        { T: 'ZERO', o: 0, c: 0, v: 1 },
        { o: 5, c: 6, v: 1 },
      ],
    });
    expect(rows.map((r) => r.ticker)).toEqual(['GOOD']);
  });

  it('fills a missing high or low from the close instead of leaving it undefined', () => {
    const [row] = parseGroupedBars({ results: [{ T: 'X', o: 10, c: 11 }] });
    expect(row).toMatchObject({ high: 11, low: 11, volume: 0 });
  });

  it('reads splits and dividends, skipping anything malformed', () => {
    expect(
      parseSplits({
        results: [
          { ticker: 'aapl', execution_date: '2026-03-02', split_from: 1, split_to: 4 },
          { ticker: 'BAD', execution_date: 'soon', split_from: 1, split_to: 2 },
          { ticker: 'ZERO', execution_date: '2026-03-02', split_from: 0, split_to: 2 },
        ],
      }),
    ).toEqual([{ ticker: 'AAPL', execution_date: '2026-03-02', split_from: 1, split_to: 4 }]);
    expect(
      parseDividends({
        results: [
          { ticker: 'adi', ex_dividend_date: '2026-08-28', cash_amount: 0.99 },
          { ticker: 'NIL', ex_dividend_date: '2026-08-28', cash_amount: 0 },
          { ticker: 'BAD', ex_dividend_date: '', cash_amount: 1 },
        ],
      }),
    ).toEqual([{ ticker: 'ADI', ex_dividend_date: '2026-08-28', cash_amount: 0.99 }]);
  });
});

describe('prices — the cache', () => {
  it('shards by year and names the file after the session', () => {
    expect(barsPath('2026-10-02')).toBe('state/bars/2026/2026-10-02.csv.gz');
    expect(barsPath('2026-10-02', 'tmp/bars')).toBe('tmp/bars/2026/2026-10-02.csv.gz');
  });

  it('round-trips a session through the CSV form without losing a price', () => {
    const rows = [
      { ticker: 'AAPL', open: 200.1234, high: 205.5, low: 199.01, close: 204.4567, volume: 50_000_000 },
      { ticker: 'ADI', open: 417.15, high: 420, low: 415, close: 418.5, volume: 2_500_000 },
    ];
    const back = parseBarsCsv(encodeBarsCsv(rows, { date: '2026-10-02' }));
    expect(back).toEqual(rows);
    expect(encodeBarsCsv(rows, { date: '2026-10-02' }).split('\n')[0]).toContain('2026-10-02');
  });

  it('ignores the comment line and any truncated row when reading back', () => {
    expect(parseBarsCsv('# header\nAAPL,1,2,0.5,1.5,100\nJUNK,,,,,\n\n')).toEqual([
      { ticker: 'AAPL', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
    ]);
  });
});

describe('prices — assembling series', () => {
  const sessions = [
    { date: '2026-01-02', rows: [{ ticker: 'A', open: 1, high: 1, low: 1, close: 1, volume: 10 }, { ticker: 'B', open: 5, high: 5, low: 5, close: 5, volume: 20 }] },
    { date: '2026-01-05', rows: [{ ticker: 'A', open: 2, high: 2, low: 2, close: 2, volume: 11 }] },
    { date: '2026-01-06', rows: [{ ticker: 'A', open: 3, high: 3, low: 3, close: 3, volume: 12 }, { ticker: 'B', open: 6, high: 6, low: 6, close: 6, volume: 21 }] },
  ];

  it('builds one oldest-first series per ticker', () => {
    const map = seriesByTicker(sessions);
    expect(map.get('A')!.map((b) => b.date)).toEqual(['2026-01-02', '2026-01-05', '2026-01-06']);
    expect(map.get('A')!.map((b) => b.close)).toEqual([1, 2, 3]);
  });

  it('leaves a gap where a stock did not trade, rather than repeating the last close', () => {
    // Carrying a price forward would invent a session with zero return and make every volatility
    // measure look calmer than the stock actually was.
    const map = seriesByTicker(sessions);
    expect(map.get('B')!.map((b) => b.date)).toEqual(['2026-01-02', '2026-01-06']);
  });

  it('can be narrowed to the tickers asked for', () => {
    expect([...seriesByTicker(sessions, { tickers: ['B'] }).keys()]).toEqual(['B']);
  });
});

describe('prices — staying inside the free allowance', () => {
  it('paces requests at the plan\'s documented rate', async () => {
    expect(FREE_REQUESTS_PER_MINUTE).toBe(5);
    const limiter = new RateLimiter({ perMinute: 60_000 }); // 1 ms apart, so the test is instant
    expect(limiter.intervalMs).toBe(1);
    const started = Date.now();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    expect(Date.now() - started).toBeLessThan(500);
    expect(new RateLimiter().intervalMs).toBe(12_000);
  });

  it('has a distinct error for an exhausted allowance, so a run stops rather than degrades', () => {
    const err = new AllowanceExhausted('finished');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AllowanceExhausted');
  });
});
