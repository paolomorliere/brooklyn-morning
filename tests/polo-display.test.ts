import { describe, expect, it } from 'vitest';
import type { PoloGame, PoloSourceStatus } from '@/types';
import {
  datesWithResults,
  formatDateChip,
  formatDayHeading,
  freshnessOf,
  groupByDate,
  initials,
  stepDate,
  validFeed,
  winnerOf,
} from '@/lib/polo';

const game = (over: Partial<PoloGame> = {}): PoloGame => ({
  id: 'x',
  date: '2026-08-29',
  time: '14:00',
  home: { team: 'liu', score: 16 },
  away: { team: 'wagner', score: 15 },
  neutral: true,
  hosted: null,
  ot: '2OT',
  exhibition: false,
  tournament: null,
  venue: null,
  sources: [],
  conflict: null,
  firstSeenAt: null,
  ...over,
});

const source = (over: Partial<PoloSourceStatus> = {}): PoloSourceStatus => ({
  id: 'liu',
  school: 'Long Island University',
  display: 'LIU',
  url: 'x',
  ok: true,
  checkedAt: '2026-09-22T18:00:00.000Z',
  found: 11,
  error: null,
  note: null,
  ...over,
});

describe('grouping by the date the game was played', () => {
  it('lists the most recent day first and orders each day by start time', () => {
    const days = groupByDate([
      game({ id: 'a', date: '2026-08-29', time: '19:20' }),
      game({ id: 'b', date: '2026-09-12', time: '15:30' }),
      game({ id: 'c', date: '2026-08-29', time: '14:00' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-09-12', '2026-08-29']);
    expect(days[1].games.map((g) => g.id)).toEqual(['c', 'a']);
  });

  it('puts games with no known start time last, without inventing one', () => {
    const days = groupByDate([game({ id: 'a', time: null }), game({ id: 'b', time: '09:00' })]);
    expect(days[0].games.map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('is stable when two games share a time', () => {
    const days = groupByDate([game({ id: 'zz', time: '10:00' }), game({ id: 'aa', time: '10:00' })]);
    expect(days[0].games.map((g) => g.id)).toEqual(['aa', 'zz']);
  });
});

describe('date navigation', () => {
  const dates = ['2026-09-20', '2026-09-12', '2026-08-29'];

  it('offers only dates that actually have results', () => {
    expect(datesWithResults([game({ date: '2026-09-12' }), game({ date: '2026-08-29' }), game({ date: '2026-09-12' })]))
      .toEqual(['2026-09-12', '2026-08-29']);
  });

  it('steps to the neighbouring day that has results, skipping empty ones', () => {
    expect(stepDate(dates, '2026-09-12', -1)).toBe('2026-08-29');
    expect(stepDate(dates, '2026-09-12', 1)).toBe('2026-09-20');
  });

  it('stops at each end instead of wrapping round', () => {
    expect(stepDate(dates, '2026-08-29', -1)).toBeNull();
    expect(stepDate(dates, '2026-09-20', 1)).toBeNull();
    expect(stepDate(dates, '2026-01-01', -1)).toBeNull();
  });

  it('includes weekdays', () => {
    // 2026-09-11 is a Friday; it must be offered like any other day with results.
    expect(datesWithResults([game({ date: '2026-09-11' })])).toEqual(['2026-09-11']);
    expect(formatDayHeading('2026-09-11')).toBe('Friday, September 11');
  });

  it('formats headings and chips', () => {
    expect(formatDayHeading('2026-08-29')).toBe('Saturday, August 29');
    expect(formatDateChip('2026-08-29')).toBe('Aug 29');
  });
});

describe('row presentation', () => {
  it('marks the winner, and neither side on a tie or a withheld score', () => {
    expect(winnerOf(game())).toBe('home');
    expect(winnerOf(game({ home: { team: 'liu', score: 8 }, away: { team: 'navy', score: 22 } }))).toBe('away');
    expect(winnerOf(game({ home: { team: 'liu', score: 9 }, away: { team: 'navy', score: 9 } }))).toBeNull();
    expect(winnerOf(game({ home: { team: 'liu', score: null }, away: { team: 'navy', score: null } }))).toBeNull();
  });

  it('falls back to initials for a team with no logo', () => {
    expect(initials("Mount St. Mary's")).toBe('MS');
    expect(initials('LIU')).toBe('LI');
    expect(initials('Brown')).toBe('BR');
    expect(initials('')).toBe('?');
  });
});

describe('freshness is never overstated', () => {
  it('claims everything only when every school was checked', () => {
    const f = freshnessOf([source(), source({ id: 'brown', display: 'Brown' })]);
    expect(f.complete).toBe(true);
    expect(f.okCount).toBe(2);
    expect(f.failed).toEqual([]);
  });

  it('names the schools that failed and does not count them as checked', () => {
    const f = freshnessOf([
      source(),
      source({ id: 'navy', display: 'Navy', ok: false, error: 'HTTP 503' }),
      source({ id: 'harvard', display: 'Harvard', ok: false, error: 'timeout' }),
    ]);
    expect(f.complete).toBe(false);
    expect(f.okCount).toBe(1);
    expect(f.failed).toEqual(['Navy', 'Harvard']);
  });

  it('reports the latest successful check, ignoring failed ones', () => {
    const f = freshnessOf([
      source({ checkedAt: '2026-09-22T18:00:00.000Z' }),
      source({ id: 'brown', checkedAt: '2026-09-22T19:00:00.000Z' }),
      source({ id: 'navy', ok: false, checkedAt: '2026-09-22T23:00:00.000Z' }),
    ]);
    expect(f.checkedAt).toBe('2026-09-22T19:00:00.000Z');
  });

  it('claims nothing when there are no sources at all', () => {
    expect(freshnessOf([]).complete).toBe(false);
  });
});

describe('downloaded feed validation', () => {
  const ok = { schemaVersion: 1, season: 2026, sport: "Men's Water Polo", builtAt: 'now', sources: [], teams: {}, games: [] };
  it('accepts a well-formed feed', () => {
    expect(validFeed(ok)).toBe(true);
  });
  it('rejects anything malformed rather than replacing the cached results with it', () => {
    for (const bad of [null, undefined, {}, 'x', { ...ok, schemaVersion: 2 }, { ...ok, games: null }, { ...ok, teams: null }]) {
      expect(validFeed(bad)).toBe(false);
    }
  });
});
