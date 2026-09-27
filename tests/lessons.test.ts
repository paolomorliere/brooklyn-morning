import { describe, expect, it } from 'vitest';
import { daysBetween, lessonForDate, mondayOf, validatePack, type LessonPack } from '@/lib/lessons';
import w1 from '../public/data/lessons/week-01.json';
import w2 from '../public/data/lessons/week-02.json';
import index from '../public/data/lessons/lessons.index.json';
import { readFileSync } from 'node:fs';

/**
 * Midday in New York on a given date.
 *
 * Weeks are decided on the New York calendar, so a date built from the machine's local parts is
 * ambiguous — local midnight in UTC is still the previous day in New York, which is exactly the
 * kind of drift this fixes rather than tolerates.
 */
function ny(y: number, m: number, d: number): Date {
  return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T16:00:00Z`);
}

const packs = [w1, w2] as unknown as LessonPack[];

describe('lesson progression', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf(ny(2026, 9, 19))).toBe('2026-09-14'); // Saturday → Monday
    expect(mondayOf(ny(2026, 9, 14))).toBe('2026-09-14');
    expect(mondayOf(ny(2026, 9, 20))).toBe('2026-09-14'); // Sunday belongs to the week that began Monday 14th
  });
  it('serves week 1 day 1 on the start Monday and day 7 on Sunday', () => {
    const mon = lessonForDate('2026-09-14', packs, ny(2026, 9, 14));
    expect(mon.lesson?.id).toBe('week-01-d1');
    expect(mon.dayIndex).toBe(0);
    const sun = lessonForDate('2026-09-14', packs, ny(2026, 9, 20));
    expect(sun.lesson?.id).toBe('week-01-d7');
    expect(sun.isReview).toBe(false);
  });
  it('moves to week 2 the next Monday and marks review once packs run out', () => {
    expect(lessonForDate('2026-09-14', packs, ny(2026, 9, 21)).lesson?.id).toBe('week-02-d1');
    const review = lessonForDate('2026-09-14', packs, ny(2026, 9, 30)); // week 3 with only 2 packs
    expect(review.isReview).toBe(true);
    expect(review.lesson?.id).toBe('week-01-d3');
    expect(review.weekNumber).toBe(3);
  });
  it('handles no packs and DST-crossing day counts', () => {
    expect(lessonForDate('2026-09-14', [], ny(2026, 9, 14)).lesson).toBeNull();
    expect(daysBetween('2026-10-26', ny(2026, 11, 2))).toBe(7); // crosses US DST end on Nov 1
  });
  it('ships 56 valid lessons across 8 weeks', () => {
    expect(index.weeks).toHaveLength(8);
    const ids = new Set<string>();
    for (const w of index.weeks) {
      const pack = JSON.parse(readFileSync(`public/data/lessons/${w.file}`, 'utf8')) as LessonPack;
      expect(validatePack(pack)).toEqual([]);
      for (const l of pack.lessons) {
        expect(ids.has(l.id)).toBe(false);
        ids.add(l.id);
        expect(l.explanation.join(' ').length).toBeGreaterThan(400);
      }
    }
    expect(ids.size).toBe(56);
  });
  it('rejects malformed packs', () => {
    expect(validatePack({ ...w1, lessons: w1.lessons.slice(0, 6) })[0]).toMatch(/expected 7/);
    expect(validatePack({ ...w1, lessons: [...w1.lessons.slice(0, 6), w1.lessons[0]] })[0]).toMatch(/two lessons/);
  });
});
