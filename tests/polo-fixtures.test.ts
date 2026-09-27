import { describe, expect, it } from 'vitest';
import type { PoloGame } from '@/types';
import {
  awaitingResult,
  byEarliestFirst,
  clockLabel,
  counts,
  etTimeOf,
  fixtureTime,
  fixturesBetween,
  groupUpcoming,
  isFinal,
  isUpcoming,
  recordOf,
  scheduleFor,
  weekendOf,
} from '@/lib/polo';

let n = 0;
const g = (over: Partial<PoloGame> = {}): PoloGame => ({
  id: `f${++n}`,
  date: '2026-10-03',
  time: '16:00',
  timeZone: 'America/New_York',
  status: 'scheduled',
  home: { team: 'liu', score: null },
  away: { team: 'brown', score: null },
  neutral: false,
  hosted: 'liu',
  sources: [],
  conflict: null,
  ...over,
});

describe('the weekend the screen should show', () => {
  it('is Friday to Sunday of the current Monday–Sunday week in New York', () => {
    // Monday 28 September: the coming Friday to Sunday.
    expect(weekendOf('2026-09-28')).toMatchObject({ from: '2026-10-02', to: '2026-10-04' });
    // Wednesday: still the same weekend.
    expect(weekendOf('2026-09-30')).toMatchObject({ from: '2026-10-02', to: '2026-10-04' });
    // Saturday, mid-weekend: unchanged, so Sunday's games stay on screen.
    expect(weekendOf('2026-10-03')).toMatchObject({ from: '2026-10-02', to: '2026-10-04' });
    // Sunday: still its own weekend.
    expect(weekendOf('2026-10-04')).toMatchObject({ from: '2026-10-02', to: '2026-10-04' });
  });

  it('advances by itself on the next Monday', () => {
    expect(weekendOf('2026-10-05')).toMatchObject({ from: '2026-10-09', to: '2026-10-11' });
  });

  it('includes Friday, which is where weekday results come from', () => {
    const fri = g({ date: '2026-10-02' });
    const sun = g({ date: '2026-10-04' });
    const nextWeek = g({ date: '2026-10-09' });
    const w = weekendOf('2026-09-28');
    expect(fixturesBetween([fri, sun, nextWeek], w.from, w.to).map((x) => x.date)).toEqual(['2026-10-02', '2026-10-04']);
  });

  it('is read in New York, not the device’s zone', () => {
    // 02:00 UTC on Monday is still Sunday evening in New York, so the weekend has not rolled over.
    expect(weekendOf(new Date('2026-10-05T02:00:00Z'))).toMatchObject({ from: '2026-10-02', to: '2026-10-04' });
    expect(weekendOf(new Date('2026-10-05T13:00:00Z'))).toMatchObject({ from: '2026-10-09', to: '2026-10-11' });
  });
});

describe('start times are only called Eastern when they are', () => {
  it('shows a New York time as ET', () => {
    expect(fixtureTime(g({ time: '19:00', timeZone: 'America/New_York' }))).toMatchObject({ kind: 'et', label: '7:00 PM ET' });
  });

  it('converts a Pacific start time to Eastern', () => {
    const west = g({ date: '2026-10-03', time: '06:00', timeZone: 'America/Los_Angeles' });
    expect(etTimeOf(west)).toBe('09:00');
    expect(fixtureTime(west).label).toBe('9:00 AM ET');
  });

  it('converts a Mountain start time to Eastern', () => {
    expect(etTimeOf(g({ date: '2026-10-03', time: '13:00', timeZone: 'America/Denver' }))).toBe('15:00');
  });

  it('refuses to call an unverified time Eastern', () => {
    const unknown = g({ time: '14:00', timeZone: null });
    expect(etTimeOf(unknown)).toBeNull();
    expect(fixtureTime(unknown)).toMatchObject({ kind: 'local', label: '2:00 PM local' });
  });

  it('says Time TBD when the page published none', () => {
    expect(fixtureTime(g({ time: null }))).toMatchObject({ kind: 'tbd', label: 'Time TBD' });
  });

  it('formats the clock the way the app reads it', () => {
    expect(clockLabel('19:00')).toBe('7:00 PM');
    expect(clockLabel('09:30')).toBe('9:30 AM');
    expect(clockLabel('12:00')).toBe('12:00 PM');
    expect(clockLabel('00:15')).toBe('12:15 AM');
  });
});

describe('a fixture is not a result', () => {
  it('never counts toward a record until a score is published', () => {
    const played = g({ status: 'final', home: { team: 'liu', score: 12 }, away: { team: 'brown', score: 9 } });
    const upcoming = g({ status: 'scheduled' });
    expect(recordOf([played, upcoming], 'liu')).toMatchObject({ wins: 1, losses: 0, played: 1 });
    expect(counts(upcoming)).toBe(false);
    expect(counts(played)).toBe(true);
  });

  it('is not removed because its start time has passed', () => {
    const past = g({ date: '2026-10-03', time: '10:00', timeZone: 'America/New_York' });
    const now = new Date('2026-10-03T20:00:00Z'); // 16:00 in New York
    expect(isUpcoming(past)).toBe(true);
    expect(awaitingResult(past, now)).toBe(true);
    // It is still inside the weekend window, so it stays on screen.
    const w = weekendOf(now);
    expect(fixturesBetween([past], w.from, w.to)).toHaveLength(1);
  });

  it('is not "awaiting" before its start time', () => {
    const later = g({ date: '2026-10-03', time: '19:00', timeZone: 'America/New_York' });
    expect(awaitingResult(later, new Date('2026-10-03T20:00:00Z'))).toBe(false);
  });

  it('is never awaiting once a result exists', () => {
    const done = g({ status: 'final', date: '2026-10-03', home: { team: 'liu', score: 9 }, away: { team: 'brown', score: 8 } });
    expect(awaitingResult(done, new Date('2026-10-05T20:00:00Z'))).toBe(false);
    expect(isFinal(done)).toBe(true);
  });

  it('leaves the Upcoming list as soon as a final arrives, and appears once in results', () => {
    const before = [g({ id: 'x', date: '2026-10-03', status: 'scheduled' })];
    const after = [g({ id: 'x', date: '2026-10-03', status: 'final', home: { team: 'liu', score: 11 }, away: { team: 'brown', score: 10 } })];
    const w = weekendOf('2026-09-28');
    expect(fixturesBetween(before, w.from, w.to)).toHaveLength(1);
    expect(fixturesBetween(after, w.from, w.to)).toHaveLength(0);
    // Same id, so it is one event that changed state, not a second row.
    expect(after[0].id).toBe(before[0].id);
    expect(recordOf(after, 'liu').played).toBe(1);
  });

  it('keeps a postponed game out of the upcoming list but does not treat it as played', () => {
    const ppd = g({ status: 'postponed' });
    expect(isUpcoming(ppd)).toBe(false);
    expect(counts(ppd)).toBe(false);
    expect(awaitingResult(ppd, new Date('2026-12-01T12:00:00Z'))).toBe(false);
  });
});

describe('upcoming order', () => {
  it('is earliest date first, then earliest start', () => {
    const list = [
      g({ id: 'c', date: '2026-10-04', time: '09:00' }),
      g({ id: 'a', date: '2026-10-03', time: '16:00' }),
      g({ id: 'b', date: '2026-10-03', time: '10:00' }),
    ];
    expect([...list].sort(byEarliestFirst).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('puts a fixture with no published time after the ones that have one', () => {
    const list = [g({ id: 'a', time: null }), g({ id: 'b', time: '10:00' })];
    expect([...list].sort(byEarliestFirst).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('compares across zones on the real start, not the printed digits', () => {
    const east = g({ id: 'east', date: '2026-10-03', time: '10:00', timeZone: 'America/New_York' });
    const west = g({ id: 'west', date: '2026-10-03', time: '08:00', timeZone: 'America/Los_Angeles' }); // 11:00 ET
    expect([west, east].sort(byEarliestFirst).map((x) => x.id)).toEqual(['east', 'west']);
  });

  it('groups by day, earliest day first', () => {
    const days = groupUpcoming([
      g({ id: 'b', date: '2026-10-04', time: '09:00' }),
      g({ id: 'a', date: '2026-10-03', time: '16:00' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-04']);
  });
});

describe('a team’s remaining schedule', () => {
  const games = [
    g({ id: 'p', date: '2026-09-20', status: 'final', home: { team: 'liu', score: 9 }, away: { team: 'iona', score: 8 } }),
    g({ id: 'n1', date: '2026-10-03', home: { team: 'liu', score: null }, away: { team: 'brown', score: null } }),
    g({ id: 'n2', date: '2026-09-30', home: { team: 'iona', score: null }, away: { team: 'liu', score: null } }),
    g({ id: 'other', date: '2026-10-05', home: { team: 'navy', score: null }, away: { team: 'brown', score: null } }),
  ];

  it('is only that team’s unplayed games, earliest first', () => {
    expect(scheduleFor(games, 'liu').map((x) => x.id)).toEqual(['n2', 'n1']);
  });

  it('drops a game once it is final, which is where it moves to Results', () => {
    expect(scheduleFor(games, 'liu').some((x) => x.id === 'p')).toBe(false);
  });

  it('can be limited to games from a date onwards', () => {
    expect(scheduleFor(games, 'liu', '2026-10-01').map((x) => x.id)).toEqual(['n1']);
  });
});
