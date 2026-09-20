import { describe, expect, it } from 'vitest';
import { daysBetween, lessonForDate, mondayOf, validatePack, type LessonPack } from '@/lib/lessons';
import w1 from '../public/data/lessons/week-01.json';
import w2 from '../public/data/lessons/week-02.json';
import index from '../public/data/lessons/lessons.index.json';
import { readFileSync } from 'node:fs';

const packs = [w1, w2] as unknown as LessonPack[];

describe('lesson progression', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf(new Date(2026, 8, 19))).toBe('2026-09-14'); // Saturday → Monday
    expect(mondayOf(new Date(2026, 8, 14))).toBe('2026-09-14');
    expect(mondayOf(new Date(2026, 8, 20))).toBe('2026-09-14'); // Sunday belongs to the week that began Monday 14th
  });
  it('serves week 1 day 1 on the start Monday and day 7 on Sunday', () => {
    const mon = lessonForDate('2026-09-14', packs, new Date(2026, 8, 14));
    expect(mon.lesson?.id).toBe('week-01-d1');
    expect(mon.dayIndex).toBe(0);
    const sun = lessonForDate('2026-09-14', packs, new Date(2026, 8, 20));
    expect(sun.lesson?.id).toBe('week-01-d7');
    expect(sun.isReview).toBe(false);
  });
  it('moves to week 2 the next Monday and marks review once packs run out', () => {
    expect(lessonForDate('2026-09-14', packs, new Date(2026, 8, 21)).lesson?.id).toBe('week-02-d1');
    const review = lessonForDate('2026-09-14', packs, new Date(2026, 8, 30)); // week 3 with only 2 packs
    expect(review.isReview).toBe(true);
    expect(review.lesson?.id).toBe('week-01-d3');
    expect(review.weekNumber).toBe(3);
  });
  it('handles no packs and DST-crossing day counts', () => {
    expect(lessonForDate('2026-09-14', [], new Date(2026, 8, 14)).lesson).toBeNull();
    expect(daysBetween('2026-10-26', new Date(2026, 10, 2))).toBe(7); // crosses US DST end on Nov 1
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
