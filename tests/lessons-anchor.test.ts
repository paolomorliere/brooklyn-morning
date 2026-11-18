import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { LESSONS_EPOCH, lessonForDate, nextMondayOnOrAfter, type LessonPack } from '@/lib/lessons';
import { getLessonProgress, setLessonProgress } from '@/db/personal';

/**
 * One reader, two devices, one course.
 *
 * The sequence used to be anchored to the Monday after a device's first open. Paolo opened the app on
 * an iPad on 18 November 2026 and the learning section was simply absent: that iPad had anchored
 * itself to 23 November, the four-week replay pushed the anchor out to 21 December, and every date
 * before that returns no lesson. Had he waited, the iPad would have started at week 1 while his phone
 * was on week 9.
 *
 * The anchor is now `LESSONS_EPOCH` on every device, so the lesson for a date is a pure function of
 * the date and the published packs. Nothing has to be synchronised for two devices to agree.
 */

const dir = 'public/data/lessons';
const packs = readdirSync(dir)
  .filter((f) => /^week-\d+\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))) as LessonPack[];

describe('the lesson for a day does not depend on the device', () => {
  it('has packs to test against', () => {
    expect(packs.length).toBeGreaterThanOrEqual(8);
  });

  it('every device shows the same lesson on the same day, all the way through the replay', () => {
    // A month of consecutive days, spanning the replay floor and a month boundary.
    for (let i = 0; i < 30; i++) {
      const day = new Date(Date.UTC(2026, 10, 1 + i, 17, 0, 0));
      const ymd = day.toISOString().slice(0, 10);
      const phone = lessonForDate(LESSONS_EPOCH, packs, ymd);
      const ipad = lessonForDate(LESSONS_EPOCH, packs, ymd);
      expect(ipad).toEqual(phone);
      // And it is a real lesson, not an empty day.
      expect(phone.lesson, `no lesson on ${ymd}`).not.toBeNull();
    }
  });

  it('today is the same week and lesson whichever device asks', () => {
    const t = lessonForDate(LESSONS_EPOCH, packs, '2026-11-18');
    expect(t.weekNumber).toBe(5);
    expect(t.dayIndex).toBe(2); // day 3 of 7
    expect(t.lesson?.title).toBe('Rivers, borders, and disputes');
    expect(t.replayOf).toBe('2026-10-21');
  });

  it('the old install-time anchor is what produced an empty iPad, and is gone', () => {
    // Reconstruct exactly what `startMondayFor(new Date())` returned on an iPad opened that day.
    const installAnchor = nextMondayOnOrAfter(new Date('2026-11-18T17:00:00Z'));
    expect(installAnchor).toBe('2026-11-23');
    expect(lessonForDate(installAnchor, packs, '2026-11-18').lesson).toBeNull();
    // The epoch anchor, on the same day, does not.
    expect(lessonForDate(LESSONS_EPOCH, packs, '2026-11-18').lesson).not.toBeNull();
  });
});

describe('an existing install is corrected to the shared anchor', () => {
  beforeEach(async () => {
    const { personalDB, STORES } = await import('@/db/personal');
    const db = await personalDB();
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    await tx.done;
  });

  /** The store's own initialiser, re-imported fresh so its one-shot `ensure` runs again. */
  async function boot() {
    vi.resetModules();
    const { lessonStore } = await import('@/state/lessons');
    await lessonStore.ensure();
    return lessonStore.get();
  }

  it('a device that has never been used starts at the epoch, not at next Monday', async () => {
    expect(await getLessonProgress()).toBeNull();
    const s = await boot();
    expect(s.progress?.startMonday).toBe(LESSONS_EPOCH);
  });

  it('a device anchored somewhere else is moved, and keeps what it has read', async () => {
    await setLessonProgress({ startMonday: '2026-11-23', readLessonIds: ['w1-d1', 'w2-d4'] });
    const s = await boot();
    expect(s.progress?.startMonday).toBe(LESSONS_EPOCH);
    expect(s.progress?.readLessonIds).toEqual(['w1-d1', 'w2-d4']);
    // And it is persisted, not only held in memory.
    expect((await getLessonProgress())?.startMonday).toBe(LESSONS_EPOCH);
  });
});
