import { describe, expect, it } from 'vitest';
import { LESSON_REPLAY, effectiveStartMonday, lessonForDate, shiftYMD, weekStartsUpTo, weekdayIndex, type LessonPack } from '@/lib/lessons';
import w1 from '../public/data/lessons/week-01.json';
import w2 from '../public/data/lessons/week-02.json';
import w3 from '../public/data/lessons/week-03.json';
import w4 from '../public/data/lessons/week-04.json';
import w5 from '../public/data/lessons/week-05.json';
import w6 from '../public/data/lessons/week-06.json';
import w7 from '../public/data/lessons/week-07.json';
import w8 from '../public/data/lessons/week-08.json';

/**
 * The replay that puts the learning section four weeks behind from 9 November 2026.
 *
 * These tests run against the **published packs**, not fixtures, because the promise being kept is
 * that the replayed day is the original lesson — same title, same wording, same example, same
 * exercise and answer — and a fixture could not tell us that.
 */
const packs = [w1, w2, w3, w4, w5, w6, w7, w8] as unknown as LessonPack[];
const START = '2026-09-21'; // LESSONS_EPOCH: the Monday the sequence began
const on = (ymd: string) => lessonForDate(START, packs, ymd);

describe('the four-week lesson replay', () => {
  it('is a whole number of weeks, which is what keeps weekdays and the Sunday quiz aligned', () => {
    expect(LESSON_REPLAY).not.toBeNull();
    expect(LESSON_REPLAY!.offsetDays % 7).toBe(0);
    expect(LESSON_REPLAY!.offsetDays).toBe(28);
    expect(LESSON_REPLAY!.from).toBe('2026-11-09');
    expect(weekdayIndex(LESSON_REPLAY!.from)).toBe(0); // a Monday
  });

  // The four rows of the table Paolo gave.
  it.each([
    ['2026-11-09', '2026-10-12'],
    ['2026-11-10', '2026-10-13'],
    ['2026-11-15', '2026-10-18'],
    ['2026-11-16', '2026-10-19'],
  ])('%s shows the lesson that %s showed, unchanged', (appDate, originalDate) => {
    const replayed = on(appDate);
    // The original date is before the replay begins, so this is what the app actually served then.
    const original = on(originalDate);

    expect(replayed.replayOf).toBe(originalDate);
    expect(replayed.lesson).not.toBeNull();
    expect(replayed.lesson).toEqual(original.lesson);
    expect(replayed.packWeek).toBe(original.packWeek);
    expect(replayed.weekNumber).toBe(original.weekNumber);
    expect(replayed.dayIndex).toBe(original.dayIndex);
    expect(replayed.isReview).toBe(false);
    // Same weekday, so Monday stays Monday.
    expect(weekdayIndex(appDate)).toBe(weekdayIndex(originalDate));
  });

  it('puts the right lessons on the two dates Paolo asked about by name', () => {
    expect(on('2026-11-10').lesson?.title).toBe('Neural networks, explained with a dial board');
    expect(on('2026-11-10').packWeek).toBe(4);
    expect(on('2026-11-15').lesson?.title).toBe('The AI economy: chips, data centers, and who pays');
  });

  it('serves the replayed week’s own twenty-question quiz on Sunday 15 November', () => {
    const sunday = on('2026-11-15');
    expect(sunday.dayIndex).toBe(6);
    expect(sunday.quizMissing).toBe(false);
    expect(sunday.quiz).toHaveLength(20);
    // The same twenty questions as the week it is replaying, in the same order.
    expect(sunday.quiz).toEqual(on('2026-10-18').quiz);
    expect(sunday.quiz).toEqual((packs[3] as LessonPack).quiz);
  });

  it('keeps the replayed Sunday quiz in a different record from the original attempt', () => {
    // `weekStart` is the key every quiz result and draft is filed under. The replayed Sunday must not
    // land on the October key, or taking it again would erase the earlier result.
    expect(on('2026-11-15').weekStart).toBe('2026-11-09');
    expect(on('2026-10-18').weekStart).toBe('2026-10-12');
    expect(on('2026-11-15').weekStart).not.toBe(on('2026-10-18').weekStart);
  });

  it('leaves every date before 9 November exactly as it was', () => {
    for (const ymd of ['2026-09-21', '2026-10-12', '2026-10-18', '2026-11-01', '2026-11-08']) {
      const withReplay = lessonForDate(START, packs, ymd);
      const withoutReplay = lessonForDate(START, packs, ymd, null);
      expect(withReplay).toEqual(withoutReplay);
      expect(withReplay.replayOf).toBeUndefined();
    }
    // The Sunday immediately before the replay is still week 7's last day.
    expect(on('2026-11-08').packWeek).toBe(7);
    expect(on('2026-11-08').dayIndex).toBe(6);
  });

  it('rolls over to the next original week on the Monday after, rather than resetting', () => {
    expect(on('2026-11-16').packWeek).toBe(5);
    expect(on('2026-11-16').dayIndex).toBe(0);
    expect(on('2026-11-16').weekStart).toBe('2026-11-16');
    expect(on('2026-11-22').packWeek).toBe(5);
    expect(on('2026-11-23').packWeek).toBe(6);
  });

  it('never catches up, and never resets at the start of a month', () => {
    // A month later the gap is still exactly 28 days, across the 1 December boundary.
    for (const ymd of ['2026-11-30', '2026-12-01', '2026-12-07', '2027-01-04']) {
      expect(on(ymd).replayOf).toBe(shiftYMD(ymd, -28));
    }
  });

  it('advances exactly one original lesson per day', () => {
    let previous: string | null = null;
    for (let i = 0; i < 21; i++) {
      const ymd = shiftYMD('2026-11-09', i);
      const seen = on(ymd);
      expect(seen.replayOf).toBe(shiftYMD(ymd, -28));
      expect(seen.lesson?.id).not.toBe(previous);
      previous = seen.lesson?.id ?? null;
    }
  });

  it('would have started a Review cycle on 16 November without the replay', () => {
    // What the replay is for: the eight packs run out, and week 9 repeats week 1.
    const unshifted = lessonForDate(START, packs, '2026-11-16', null);
    expect(unshifted.isReview).toBe(true);
    expect(unshifted.packWeek).toBe(1);
    expect(on('2026-11-16').isReview).toBe(false);
  });

  it('shifts the start date, not the date being asked about', () => {
    expect(effectiveStartMonday(START, '2026-11-08')).toBe(START);
    expect(effectiveStartMonday(START, '2026-11-09')).toBe('2026-10-19');
    expect(effectiveStartMonday(START, '2026-11-09', null)).toBe(START);
  });

  it('leaves the app’s own week list on the real calendar', () => {
    const weeks = weekStartsUpTo(START, '2026-11-15');
    expect(weeks[0]).toBe('2026-09-21');
    expect(weeks[weeks.length - 1]).toBe('2026-11-09');
    expect(weeks).toContain('2026-10-12');
  });
});
