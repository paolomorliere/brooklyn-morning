import { describe, expect, it } from 'vitest';
import {
  AllowanceExhausted,
  FREE_HISTORY_DAYS,
  FREE_REQUESTS_PER_MINUTE,
  SAFE_REQUESTS_PER_MINUTE,
  KeyRejected,
  OutsideEntitlement,
  earliestAvailableSession,
  isBeforeEndOfDay,
  lastCompletedSession,
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

describe('prices — the two-year history limit', () => {
  it('computes the oldest session the plan serves, instead of hardcoding a date', () => {
    // The first version of the backfill started at a written-down 2024-10-01. On 6 October 2026 that is
    // four days outside the two-year window, so the very first request was refused and the whole run
    // died. The boundary moves every day; it has to be computed from the day the build runs.
    expect(earliestAvailableSession('2026-10-06')).toBe('2024-10-16');
    expect(earliestAvailableSession('2026-10-07')).toBe('2024-10-17');
    expect(FREE_HISTORY_DAYS).toBe(720);
    // A fortnight of margin inside the two years, because the refusal is indistinguishable from any other.
    const span = (Date.parse('2026-10-06') - Date.parse(earliestAvailableSession('2026-10-06')!)) / 86_400_000;
    expect(span).toBeLessThan(730);
    expect(span).toBeGreaterThan(700);
    expect(earliestAvailableSession('not a date')).toBeNull();
  });

  it('never asks for today, because an end-of-day plan cannot have it yet', () => {
    // The build runs before the market opens. Asking for today returned
    // NOT_AUTHORIZED "Attempted to request today's data before end of day", which is not a problem with
    // the key or with the plan's history — it is a question that cannot have an answer yet. The first
    // connection check asked exactly that and reported a perfectly good key as broken.
    expect(lastCompletedSession('2026-10-06')).toBe('2026-10-05'); // Tuesday to Monday
    expect(lastCompletedSession('2026-10-05')).toBe('2026-10-02'); // Monday back over the weekend
    expect(lastCompletedSession('2026-10-11')).toBe('2026-10-09'); // Sunday back to Friday
    expect(lastCompletedSession('not a date')).toBeNull();
  });

  it('reads "before end of day" as proof the key works, not as a failure', () => {
    expect(isBeforeEndOfDay("Attempted to request today's data before end of day. Please upgrade your plan")).toBe(true);
    // And does not mistake a genuine entitlement refusal for it.
    expect(isBeforeEndOfDay('You are not entitled to this data. Please upgrade your plan')).toBe(false);
    expect(isBeforeEndOfDay(null)).toBe(false);
  });
});

describe('prices — staying inside the free allowance', () => {
  it('paces below the plan\'s ceiling rather than on it', async () => {
    // Pacing at exactly five a minute put every request on the edge of the window. The feed's counter
    // and this one need only disagree by a fraction of a second, and the first backfill was cut off
    // after five requests with "You've exceeded the maximum requests per minute". One spare request a
    // minute costs twenty-five minutes on a two-year backfill and buys a run that finishes.
    expect(FREE_REQUESTS_PER_MINUTE).toBe(5);
    expect(SAFE_REQUESTS_PER_MINUTE).toBe(4);
    expect(new RateLimiter().intervalMs).toBe(15_000);
    const limiter = new RateLimiter({ perMinute: 60_000 }); // 1 ms apart, so the test is instant
    expect(limiter.intervalMs).toBe(1);
    const started = Date.now();
    await limiter.wait();
    await limiter.wait();
    await limiter.wait();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('tells the three refusals apart, because each needs a different response', () => {
    // A rejected key is a setup problem and the run must stop. A date outside the plan's history is one
    // session to skip. An exhausted allowance means stop and try again later. Collapsing them into one
    // error is how a four-day-stale start date killed an otherwise working build.
    for (const [E, name] of [
      [AllowanceExhausted, 'AllowanceExhausted'],
      [KeyRejected, 'KeyRejected'],
      [OutsideEntitlement, 'OutsideEntitlement'],
    ] as const) {
      const err = new E('x');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe(name);
    }
  });
});
