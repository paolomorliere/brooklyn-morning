import { describe, expect, it } from 'vitest';
import { HORIZON_SESSIONS, exitSession, plannedWindow } from '../scripts/lib/portfolio.mjs';

/**
 * The window the build plans for a pick it is about to publish.
 *
 * `tests/stocks-portfolio.test.ts` already covers `entrySession` on its own, and it passed the whole
 * time the shipped build was wrong: the build never called it. It projected the next weekday after the
 * last cached bar and used that, so the hour of publication had no effect at all. These tests are on
 * `plannedWindow`, which is the code the build now runs, and the first one is the case that actually
 * went out:
 *
 *   ATEX, published 2026-10-06 at 18:20 New York, was stored as entering the open of 2026-10-06 —
 *   a session that had closed nine hours before the pick existed.
 */

// The sessions cached when the 6 October run happened; the calendar ends at the decision session.
const CALENDAR = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05'];

describe('the entry session the build plans', () => {
  it('does not book an after-hours pick into a session that has already opened', () => {
    const { entry } = plannedWindow(CALENDAR, '2026-10-06T22:20:59.688Z', HORIZON_SESSIONS);
    expect(entry).toBe('2026-10-07');
    expect(entry).not.toBe('2026-10-06');
  });

  it('buys at the same morning’s open when the pick is published before 09:30 New York', () => {
    // 2026-10-07T11:10Z is 07:10 ET, which is the hour the overnight schedule aims at.
    const { entry } = plannedWindow([...CALENDAR, '2026-10-06'], '2026-10-07T11:10:46.517Z', HORIZON_SESSIONS);
    expect(entry).toBe('2026-10-07');
  });

  it('moves to the next session at exactly 09:30 New York', () => {
    const before = plannedWindow([...CALENDAR, '2026-10-06'], '2026-10-07T13:29:00.000Z', HORIZON_SESSIONS);
    const after = plannedWindow([...CALENDAR, '2026-10-06'], '2026-10-07T13:30:00.000Z', HORIZON_SESSIONS);
    expect(before.entry).toBe('2026-10-07');
    expect(after.entry).toBe('2026-10-08');
  });

  it('skips the weekend when the pick is made on a Saturday', () => {
    // 2026-10-10 is a Saturday; 2026-10-12 is the Monday.
    const { entry } = plannedWindow([...CALENDAR, '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'], '2026-10-10T15:00:00.000Z', HORIZON_SESSIONS);
    expect(entry).toBe('2026-10-12');
  });

  it('counts the entry session as day 1 of the hold', () => {
    const { entry, exit, extended } = plannedWindow(CALENDAR, '2026-10-06T22:20:59.688Z', HORIZON_SESSIONS);
    expect(entry).toBe('2026-10-07');
    expect(exit).toBe(exitSession(extended, entry!, HORIZON_SESSIONS));
    expect(extended.indexOf(exit!) - extended.indexOf(entry!)).toBe(HORIZON_SESSIONS - 1);
  });

  it('projects far enough ahead that the exit is always named', () => {
    const { exit } = plannedWindow(CALENDAR, '2026-10-06T22:20:59.688Z', HORIZON_SESSIONS);
    expect(exit).toBeTruthy();
  });

  it('says it does not know rather than guessing, when there is no calendar at all', () => {
    expect(plannedWindow([], '2026-10-06T22:20:59.688Z', HORIZON_SESSIONS)).toEqual({
      entry: null,
      exit: null,
      extended: [],
    });
  });
});
