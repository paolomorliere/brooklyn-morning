import { describe, expect, it } from 'vitest';
import type { Lesson } from '@/types';
import {
  LESSONS_EPOCH,
  daysBetween,
  lessonForDate,
  mondayOf,
  mondayOfYMD,
  nextMondayOnOrAfter,
  nyDate,
  shiftYMD,
  startMondayFor,
  validatePack,
  weekStartsUpTo,
  type LessonPack,
} from '@/lib/lessons';

const lesson = (week: number, day: number): Lesson => ({
  id: `week-0${week}-d${day}`,
  week,
  day,
  theme: `Theme ${week}`,
  title: `W${week}D${day}`,
  explanation: ['x'],
  example: ['y'],
  exercise: null,
  readMinutes: 2,
});

const pack = (week: number, withQuiz = true): LessonPack => ({
  schemaVersion: 1,
  week,
  theme: `Theme ${week}`,
  version: `v${week}`,
  lessons: Array.from({ length: 7 }, (_, i) => lesson(week, i + 1)),
  ...(withQuiz
    ? { quiz: Array.from({ length: 20 }, (_, i) => ({ q: `Q${i}`, choices: ['a', 'b', 'c', 'd'], answer: i % 4 })) }
    : {}),
});

describe('weeks run on the New York calendar', () => {
  it('reads the New York date, not the device’s', () => {
    // New York is four hours behind UTC in September, so 03:30 UTC on the 28th is still the 27th.
    expect(nyDate(new Date('2026-09-28T03:30:00Z'))).toBe('2026-09-27');
    expect(nyDate(new Date('2026-09-28T13:00:00Z'))).toBe('2026-09-28');
  });

  it('puts Sunday at the end of its Monday–Sunday week', () => {
    expect(mondayOfYMD('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(mondayOfYMD('2026-09-21')).toBe('2026-09-21'); // Monday
    expect(mondayOf(new Date('2026-09-28T03:30:00Z'))).toBe('2026-09-21'); // still Sunday in NY
  });

  it('counts days between calendar dates without a timezone shift', () => {
    expect(daysBetween('2026-09-21', '2026-09-27')).toBe(6);
    expect(daysBetween('2026-09-21', new Date('2026-09-28T03:30:00Z'))).toBe(6);
    // Across the end of daylight saving, a week is still seven days.
    expect(daysBetween('2026-10-26', '2026-11-02')).toBe(7);
  });

  it('starts a fresh install on the next Monday, never before the epoch', () => {
    expect(nextMondayOnOrAfter(new Date('2026-09-27T15:00:00Z'))).toBe('2026-09-28');
    expect(nextMondayOnOrAfter(new Date('2026-09-28T15:00:00Z'))).toBe('2026-09-28');
    expect(startMondayFor(new Date('2026-08-01T15:00:00Z'))).toBe(LESSONS_EPOCH);
  });
});

describe('which lesson belongs to a day', () => {
  const packs = [pack(1), pack(2)];

  it('gives Sunday day 7 and its week’s quiz', () => {
    const v = lessonForDate('2026-09-21', packs, '2026-09-27');
    expect(v.dayIndex).toBe(6);
    expect(v.lesson?.id).toBe('week-01-d7');
    expect(v.quiz).toHaveLength(20);
    expect(v.quizMissing).toBe(false);
    expect(v.weekStart).toBe('2026-09-21');
    expect(v.packVersion).toBe('v1');
  });

  it('gives no quiz on any other day', () => {
    for (const d of ['2026-09-21', '2026-09-24', '2026-09-26']) {
      expect(lessonForDate('2026-09-21', packs, d).quiz ?? null).toBeNull();
    }
  });

  it('says so when Sunday arrives and the stored pack has no quiz', () => {
    // Exactly the state Paolo's phone was in: a pack downloaded before quizzes existed.
    const v = lessonForDate('2026-09-21', [pack(1, false)], '2026-09-27');
    expect(v.lesson?.id).toBe('week-01-d7');
    expect(v.quizMissing).toBe(true);
  });

  it('is stable for a past date, so an archived edition resolves to its own lesson', () => {
    expect(lessonForDate('2026-09-21', packs, '2026-09-23').lesson?.id).toBe('week-01-d3');
    expect(lessonForDate('2026-09-21', packs, '2026-09-30').lesson?.id).toBe('week-02-d3');
    expect(lessonForDate('2026-09-21', packs, '2026-09-30').weekStart).toBe('2026-09-28');
  });

  it('reports a date before the sequence started rather than guessing', () => {
    const v = lessonForDate('2026-09-21', packs, '2026-09-14');
    expect(v.lesson).toBeNull();
    expect(v.startsOn).toBe('2026-09-21');
  });

  it('lists every week Monday up to a date', () => {
    expect(weekStartsUpTo('2026-09-21', '2026-10-06')).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(weekStartsUpTo('2026-09-21', '2026-09-20')).toEqual([]);
  });

  it('steps dates across month ends', () => {
    expect(shiftYMD('2026-09-28', 6)).toBe('2026-10-04');
    expect(shiftYMD('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('a pack has to carry a full quiz to be published', () => {
  it('accepts twenty questions', () => {
    expect(validatePack(pack(1))).toEqual([]);
  });
  it('rejects a short quiz rather than letting the app promise twenty', () => {
    const short = { ...pack(1), quiz: pack(1).quiz!.slice(0, 5) };
    expect(validatePack(short).join(' ')).toMatch(/5 questions, expected 20/);
  });
  it('still accepts a pack with no quiz at all, so old packs keep working', () => {
    expect(validatePack(pack(1, false))).toEqual([]);
  });
});
