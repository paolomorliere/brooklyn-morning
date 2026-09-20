import { describe, expect, it } from 'vitest';
import { LESSONS_EPOCH, lessonForDate, nextMondayOnOrAfter, startMondayFor, type LessonPack } from '@/lib/lessons';
import w1 from '../public/data/lessons/week-01.json';

const packs = [w1] as unknown as LessonPack[];

describe('Monday start and Sunday quiz', () => {
  it('a Sunday install waits for Monday; a Monday install starts that day', () => {
    expect(nextMondayOnOrAfter(new Date(2026, 8, 20))).toBe('2026-09-21');
    expect(nextMondayOnOrAfter(new Date(2026, 8, 21))).toBe('2026-09-21');
    expect(nextMondayOnOrAfter(new Date(2026, 8, 23))).toBe('2026-09-28');
    expect(startMondayFor(new Date(2026, 8, 15))).toBe(LESSONS_EPOCH); // never before the epoch
  });
  it('before the start date shows no lesson and reports the start', () => {
    const t = lessonForDate('2026-09-21', packs, new Date(2026, 8, 20));
    expect(t.lesson).toBeNull();
    expect(t.startsOn).toBe('2026-09-21');
  });
  it('Monday is lesson 1, Sunday is lesson 7 plus the quiz', () => {
    expect(lessonForDate('2026-09-21', packs, new Date(2026, 8, 21)).lesson?.day).toBe(1);
    const sun = lessonForDate('2026-09-21', packs, new Date(2026, 8, 27));
    expect(sun.lesson?.day).toBe(7);
    expect(sun.quiz?.length).toBe(20);
    expect(lessonForDate('2026-09-21', packs, new Date(2026, 8, 26)).quiz).toBeNull();
  });
});
