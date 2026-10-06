import { describe, expect, it } from 'vitest';
import {
  calendarFrom,
  entrySession,
  exitSession,
  maxDrawdown,
  measurePick,
  neweyWestTStat,
  nyParts,
  projectSessions,
  positionReturn,
  sessionIndexAtOrAfter,
  sessionIndexAtOrBefore,
  sessionsHeld,
  summarise,
  tStatistic,
} from '../scripts/lib/portfolio.mjs';
import type { Bar } from '../scripts/lib/signals.d.mts';

/** Five sessions in the first week of January 2026, Monday to Friday. */
const WEEK = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];

const bar = (date: string, open: number, close: number): Bar => ({ date, open, close, volume: 1_000_000 });

describe('portfolio — New York time', () => {
  it('reads an instant in New York, in both halves of the year', () => {
    // July is EDT, UTC−4; November is EST, UTC−5. Both are 09:00 locally.
    expect(nyParts('2026-07-01T13:00:00Z')).toEqual({ date: '2026-07-01', minutes: 540 });
    expect(nyParts('2026-11-23T14:00:00Z')).toEqual({ date: '2026-11-23', minutes: 540 });
    // Shortly after midnight UTC still belongs to the previous New York day.
    expect(nyParts('2026-07-02T02:00:00Z')!.date).toBe('2026-07-01');
    expect(nyParts('not a time')).toBeNull();
  });
});

describe('portfolio — the trading calendar', () => {
  it('is taken from the dates the feed published, with no holiday table to maintain', () => {
    const bars = [bar('2026-01-05', 1, 1), bar('2026-01-02', 1, 1), bar('2026-01-05', 1, 1)];
    expect(calendarFrom(bars)).toEqual(['2026-01-02', '2026-01-05']);
    expect(calendarFrom(null)).toEqual([]);
  });

  it('locates a date, or the session either side of it', () => {
    // Sunday the 4th has no bar, so the last session at or before it is Friday the 2nd.
    expect(sessionIndexAtOrBefore(WEEK, '2026-01-04')).toBe(0);
    expect(sessionIndexAtOrBefore(WEEK, '2026-01-06')).toBe(2);
    expect(sessionIndexAtOrBefore(WEEK, '2025-12-31')).toBe(-1);
    expect(sessionIndexAtOrAfter(WEEK, '2026-01-04')).toBe(1);
    expect(sessionIndexAtOrAfter(WEEK, '2026-02-01')).toBe(-1);
  });
});

describe('portfolio — entry', () => {
  it('buys that day\'s open when the pick is published before the bell', () => {
    // 11:00 UTC is 06:00 in New York — the edition's own publication time.
    expect(entrySession(WEEK, '2026-01-06T11:00:00Z')).toBe('2026-01-06');
  });

  it('buys the next session\'s open when the pick is published at 11:00 New York time', () => {
    // 16:00 UTC is 11:00 ET: the market is already open, so that open is behind us. A system that
    // used it would be buying at a price that existed before the pick did.
    expect(entrySession(WEEK, '2026-01-06T16:00:00Z')).toBe('2026-01-07');
  });

  it('buys at the open exactly at 09:30, never before', () => {
    expect(entrySession(WEEK, '2026-01-06T14:29:00Z')).toBe('2026-01-06'); // 09:29 ET
    expect(entrySession(WEEK, '2026-01-06T14:30:00Z')).toBe('2026-01-07'); // 09:30 ET
  });

  it('moves a weekend or holiday publication to the next session', () => {
    expect(entrySession(WEEK, '2026-01-03T11:00:00Z')).toBe('2026-01-05'); // Saturday
    expect(entrySession(WEEK, '2026-01-04T20:00:00Z')).toBe('2026-01-05'); // Sunday evening
  });

  it('says nothing rather than guessing when the calendar does not reach that far', () => {
    expect(entrySession(WEEK, '2026-01-09T16:00:00Z')).toBeNull();
    expect(entrySession(WEEK, 'nonsense')).toBeNull();
  });
});

describe('portfolio — the holding window', () => {
  it('counts the entry session as day 1', () => {
    expect(exitSession(WEEK, '2026-01-02', 1)).toBe('2026-01-02');
    expect(exitSession(WEEK, '2026-01-02', 3)).toBe('2026-01-06');
    expect(sessionsHeld(WEEK, '2026-01-02', '2026-01-06')).toBe(3);
  });

  it('is not shortened by a holiday inside it', () => {
    // Thanksgiving 2026 falls on 26 November, so the market is shut that Thursday.
    const thanksgiving = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27', '2026-11-30'];
    expect(exitSession(thanksgiving, '2026-11-23', 4)).toBe('2026-11-27');
    expect(sessionsHeld(thanksgiving, '2026-11-23', '2026-11-27')).toBe(4);
    // Had the market traded on the 26th, the same four sessions would have ended a day earlier. The
    // window is four sessions either way; it is the calendar span that stretches.
    const noHoliday = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
    expect(exitSession(noHoliday, '2026-11-23', 4)).toBe('2026-11-26');
  });

  it('has no exit yet when the calendar has not reached session 21', () => {
    expect(exitSession(WEEK, '2026-01-08', 21)).toBeNull();
  });

  it('projects the sessions a pick published before the bell will be bought in', () => {
    // The entry session has not traded yet, so the real calendar cannot name it. Weekends are the only
    // thing the projection knows: a holiday inside it shifts everything after by one session, which is
    // why the card calls the exit approximate and why nothing is measured against a projection.
    expect(projectSessions(WEEK, 4)).toEqual(['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15']);
    expect(projectSessions(['2026-01-09'], 2)).toEqual(['2026-01-12', '2026-01-13']);
    expect(projectSessions([], 3)).toEqual([]);
  });
});

describe('portfolio — one position', () => {
  const bars = [bar('2026-01-02', 100, 101), bar('2026-01-05', 101, 105), bar('2026-01-06', 105, 110)];

  it('buys the open and sells the close, before costs', () => {
    const p = positionReturn({ bars, entryDate: '2026-01-02', valueDate: '2026-01-06', costBps: 0 })!;
    expect(p.entryPrice).toBe(100);
    expect(p.valuePrice).toBe(110);
    expect(p.gross).toBeCloseTo(0.1, 12);
    expect(p.net).toBeCloseTo(0.1, 12);
  });

  it('applies ten basis points each way', () => {
    const p = positionReturn({ bars, entryDate: '2026-01-02', valueDate: '2026-01-06' })!;
    expect(p.gross).toBeCloseTo(0.1, 12);
    expect(p.net).toBeCloseTo((110 * 0.999) / (100 * 1.001) - 1, 12);
    expect(p.net).toBeCloseTo(0.0978021978, 9);
    expect(p.net).toBeLessThan(p.gross);
  });

  it('adds the dividends an owner over the window would have received', () => {
    const divs = [{ exDate: '2026-01-05', amount: 2, gross: 2, splitFactor: 1 }];
    const p = positionReturn({ bars, dividends: divs, entryDate: '2026-01-02', valueDate: '2026-01-06', costBps: 0 })!;
    expect(p.dividends).toBe(2);
    expect(p.gross).toBeCloseTo(112 / 100 - 1, 12);
  });

  it('returns nothing when a session is not priced, rather than reaching for a nearby bar', () => {
    expect(positionReturn({ bars, entryDate: '2026-01-07', valueDate: '2026-01-06' })).toBeNull();
  });
});

describe('portfolio — measuring a pick', () => {
  const bars = WEEK.map((d, i) => bar(d, 100 + i, 100 + i + 1));
  const spy = WEEK.map((d, i) => bar(d, 400 + i, 400 + i + 0.5));
  const ctx = { calendar: WEEK, bars, benchmarks: { SPY: { bars: spy } }, asOf: '2026-01-09', horizon: 3 };

  it('completes a position whose exit session has passed', () => {
    const r = measurePick({ ticker: 'A', publishedAt: '2026-01-02T11:00:00Z' }, ctx);
    expect(r.status).toBe('complete');
    expect(r.entryDate).toBe('2026-01-02');
    expect(r.plannedExit).toBe('2026-01-06');
    expect(r.sessionsHeld).toBe(3);
    expect(r.net).toBeCloseTo((103 * 0.999) / (100 * 1.001) - 1, 12);
    expect(r.excess!.SPY).toBeCloseTo(r.net! - r.benchmarks!.SPY!.net, 12);
  });

  it('reports a position that is still running as open, priced to the latest session', () => {
    const r = measurePick({ ticker: 'B', publishedAt: '2026-01-08T11:00:00Z' }, ctx);
    expect(r.status).toBe('open');
    expect(r.entryDate).toBe('2026-01-08');
    expect(r.plannedExit).toBeNull();
    expect(r.valueDate).toBe('2026-01-09');
    expect(r.sessionsHeld).toBe(2);
  });

  it('says so when the market has not opened since publication', () => {
    const r = measurePick({ ticker: 'C', publishedAt: '2026-01-09T16:00:00Z' }, ctx);
    expect(r.status).toBe('not-entered');
    expect(r.reason).toMatch(/has not opened/);
  });

  it('says so when the entry session has no bar', () => {
    const r = measurePick({ ticker: 'D', publishedAt: '2026-01-02T11:00:00Z' }, { ...ctx, bars: bars.slice(2) });
    expect(r.status).toBe('unpriced');
    expect(r.reason).toMatch(/no bar for 2026-01-02/);
  });
});

describe('portfolio — the recap', () => {
  const row = (net: number, status: string, sessionsHeld: number, spy = 0) => ({
    status,
    net,
    gross: net,
    sessionsHeld,
    excess: { SPY: net - spy },
  });

  it('averages completed positions only, and counts the open ones separately', () => {
    const s = summarise([row(0.1, 'complete', 21), row(-0.05, 'complete', 21), row(0.3, 'open', 4)] as never, {
      benchmark: 'SPY',
    });
    expect(s.n).toBe(2);
    expect(s.open).toBe(1);
    expect(s.meanNet).toBeCloseTo(0.025, 12);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBe(0.5);
    expect(s.averageGain).toBeCloseTo(0.1, 12);
    expect(s.averageLoss).toBeCloseTo(-0.05, 12);
  });

  it('makes a mixed-horizon average impossible to mistake for a return', () => {
    // This is the shape that produced the published −2.85%: five positions held 5, 4, 3, 2 and 1
    // sessions, averaged as if comparable. None of them has completed a 21-session horizon, so the
    // headline is empty and the mixed figure is reported under its own name, with the span it covers.
    const rows = [
      row(-0.0120, 'open', 5),
      row(-0.0375, 'open', 4),
      row(-0.0260, 'open', 3),
      row(-0.0384, 'open', 2),
      row(-0.0286, 'open', 1),
    ];
    const s = summarise(rows as never, { benchmark: 'SPY' });
    expect(s.n).toBe(0);
    expect(s.meanNet).toBeNull();
    expect(s.mixedHorizonCount).toBe(5);
    expect(s.horizonsSpanned).toEqual([1, 2, 3, 4, 5]);
    expect(s.mixedHorizonMean).toBeCloseTo((-0.012 - 0.0375 - 0.026 - 0.0384 - 0.0286) / 5, 12);
    expect(s.mixedHorizonMean).toBeCloseTo(-0.0285, 4);
  });

  it('computes a t-statistic that an honest reading has to call inconclusive', () => {
    // Six completed excess returns averaging −2.03% with a 4.14% standard deviation — the v1 record
    // on a uniform five-session hold. t ≈ −1.20: nowhere near a conclusion in either direction. The
    // number exists so the card can say that, not to lend the record authority.
    const excess = [0.0297, -0.0703, 0.0097, -0.0503, 0.009447, -0.050047];
    expect(excess.reduce((a, b) => a + b, 0) / 6).toBeCloseTo(-0.0203, 5);
    const t = tStatistic(excess)!;
    expect(t).toBeCloseTo(-1.2, 2);
    expect(tStatistic([0.01])).toBeNull();
    expect(tStatistic([0.01, 0.01])).toBeNull();
  });

  it('widens the error when the observations overlap, as daily picks held a month do', () => {
    // Twenty of any two consecutive days' positions are the same positions, so counting each day as
    // fresh evidence inflates confidence. On an independent series the two statistics agree closely; on
    // a strongly autocorrelated one the Newey-West figure is markedly smaller, which is the point.
    // A seeded walk, so the "independent" case really is: a deterministic sine is periodic, and at some
    // lags that is structure, not noise — the first version of this test used one and measured the
    // opposite of what it meant to.
    let seed = 20_260_101;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648 - 0.5;
    };
    const iid = Array.from({ length: 400 }, () => 0.004 + 0.04 * rand());
    const plainIid = tStatistic(iid)!;
    const nwIid = neweyWestTStat(iid, 21)!;
    expect(Math.abs(nwIid - plainIid)).toBeLessThan(Math.abs(plainIid) * 0.5);

    // Now the same shocks, but each day keeps most of the previous day's — which is what overlapping
    // positions do. The ordinary statistic treats 400 correlated days as 400 independent ones.
    let x = 0;
    seed = 20_260_101;
    const sticky = Array.from({ length: 400 }, () => {
      x = 0.9 * x + 0.04 * rand();
      return 0.004 + x;
    });
    expect(Math.abs(neweyWestTStat(sticky, 21)!)).toBeLessThan(Math.abs(tStatistic(sticky)!) * 0.8);

    expect(neweyWestTStat([0.01, 0.02], 21)).toBeNull();
    expect(neweyWestTStat([0.01, 0.01, 0.01], 21)).toBeNull();
  });

  it('measures the worst fall from a peak', () => {
    expect(maxDrawdown([1, 1.2, 0.9, 1.1])).toBeCloseTo(0.9 / 1.2 - 1, 12);
    expect(maxDrawdown([1, 1.1, 1.2])).toBe(0);
  });
});
