import { describe, expect, it } from 'vitest';
import { LESSONS_EPOCH, lessonForDate, nextMondayOnOrAfter, startMondayFor, type LessonPack } from '@/lib/lessons';
import w1 from '../public/data/lessons/week-01.json';

/** Midday in New York, the timezone the lesson calendar is decided in. */
function ny(y: number, m: number, d: number): Date {
  return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T16:00:00Z`);
}

const packs = [w1] as unknown as LessonPack[];

describe('Monday start and Sunday quiz', () => {
  it('a Sunday install waits for Monday; a Monday install starts that day', () => {
    expect(nextMondayOnOrAfter(ny(2026, 9, 20))).toBe('2026-09-21');
    expect(nextMondayOnOrAfter(ny(2026, 9, 21))).toBe('2026-09-21');
    expect(nextMondayOnOrAfter(ny(2026, 9, 23))).toBe('2026-09-28');
    expect(startMondayFor(ny(2026, 9, 15))).toBe(LESSONS_EPOCH); // never before the epoch
  });
  it('before the start date shows no lesson and reports the start', () => {
    const t = lessonForDate('2026-09-21', packs, ny(2026, 9, 20));
    expect(t.lesson).toBeNull();
    expect(t.startsOn).toBe('2026-09-21');
  });
  it('Monday is lesson 1, Sunday is lesson 7 plus the quiz', () => {
    expect(lessonForDate('2026-09-21', packs, ny(2026, 9, 21)).lesson?.day).toBe(1);
    const sun = lessonForDate('2026-09-21', packs, ny(2026, 9, 27));
    expect(sun.lesson?.day).toBe(7);
    expect(sun.quiz?.length).toBe(20);
    expect(lessonForDate('2026-09-21', packs, ny(2026, 9, 26)).quiz).toBeNull();
  });
});
