import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Task } from '@/types';
import { COMPLETED_TTL_MS, expiredCompletedIds, moveCategory, planCategoryRemoval, sortOpen, validateCategoryName } from '@/lib/tasks';
import { _resetPersonalDB, DEFAULT_CATEGORIES } from '@/db/personal';
import { addCategory, addTask, allCategories, allTasks, completeTask, purgeExpiredCompleted, removeCategory, uncompleteTask } from '@/db/tasks';

const mk = (id: string, extra: Partial<Task> = {}): Task => ({
  id, text: id, notes: '', categoryId: 'inbox', starred: false, createdAt: '2026-09-19T10:00:00Z', completedAt: null, order: 0, ...extra,
});

describe('12-hour completion cleanup (pure)', () => {
  const now = Date.parse('2026-09-19T22:00:00Z');
  it('removes only tasks completed 12h or more ago', () => {
    const tasks = [
      mk('old', { completedAt: new Date(now - COMPLETED_TTL_MS - 1000).toISOString() }),
      mk('exact', { completedAt: new Date(now - COMPLETED_TTL_MS).toISOString() }),
      mk('fresh', { completedAt: new Date(now - 60_000).toISOString() }),
      mk('open'),
    ];
    expect(expiredCompletedIds(tasks, now).sort()).toEqual(['exact', 'old']);
  });
  it('is stable when the clock jumps backwards (never deletes open tasks)', () => {
    expect(expiredCompletedIds([mk('open')], 0)).toEqual([]);
  });
});

describe('sorting and category rules (pure)', () => {
  it('stars first, then manual order', () => {
    const s = sortOpen([mk('b', { order: 2 }), mk('a', { order: 1 }), mk('star', { order: 9, starred: true })]);
    expect(s.map((t) => t.id)).toEqual(['star', 'a', 'b']);
  });
  it('plans a removal by moving every task and renumbering', () => {
    const tasks = [mk('t1', { categoryId: 'biz' }), mk('t2', { categoryId: 'personal' })];
    const plan = planCategoryRemoval(DEFAULT_CATEGORIES, tasks, 'biz', 'personal');
    expect(plan.movedTasks.map((t) => [t.id, t.categoryId])).toEqual([['t1', 'personal']]);
    expect(plan.categories.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
    expect(plan.categories.find((c) => c.id === 'biz')).toBeUndefined();
  });
  it('refuses to remove Inbox or to move into the removed category', () => {
    expect(() => planCategoryRemoval(DEFAULT_CATEGORIES, [], 'inbox', 'biz')).toThrow();
    expect(() => planCategoryRemoval(DEFAULT_CATEGORIES, [], 'biz', 'biz')).toThrow();
  });
  it('moves a category up/down within bounds', () => {
    expect(moveCategory(DEFAULT_CATEGORIES, 'liu', -1).map((c) => c.id)).toEqual(['inbox', 'liu', 'sfc', 'ms', 'biz', 'personal']);
    expect(moveCategory(DEFAULT_CATEGORIES, 'inbox', -1).map((c) => c.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id));
  });
  it('validates names', () => {
    expect(validateCategoryName('  ', DEFAULT_CATEGORIES)).toBeTruthy();
    expect(validateCategoryName('personal', DEFAULT_CATEGORIES)).toBeTruthy();
    expect(validateCategoryName('Personal', DEFAULT_CATEGORIES, 'personal')).toBeNull();
    expect(validateCategoryName('Travel', DEFAULT_CATEGORIES)).toBeNull();
  });
});

describe('IndexedDB task repository', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetPersonalDB();
  });

  it('seeds default categories once', async () => {
    const cats = await allCategories();
    expect(cats.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
  });

  it('adds, completes, undoes, and purges', async () => {
    const t = await addTask('Order caps', 'liu');
    await completeTask(t.id, new Date('2026-09-19T08:00:00Z'));
    expect((await allTasks())[0].completedAt).toBe('2026-09-19T08:00:00.000Z');
    await uncompleteTask(t.id);
    expect((await allTasks())[0].completedAt).toBeNull();
    await completeTask(t.id, new Date('2026-09-19T08:00:00Z'));
    expect(await purgeExpiredCompleted(Date.parse('2026-09-19T19:59:00Z'))).toBe(0);
    expect(await purgeExpiredCompleted(Date.parse('2026-09-19T20:00:00Z'))).toBe(1);
    expect(await allTasks()).toHaveLength(0);
  });

  it('removes a category and migrates its tasks atomically', async () => {
    const travel = await addCategory('Travel');
    const a = await addTask('Book flight', travel.id);
    await addTask('Unrelated', 'personal');
    await removeCategory(travel.id, 'personal');
    const tasks = await allTasks();
    expect(tasks.find((t) => t.id === a.id)?.categoryId).toBe('personal');
    expect((await allCategories()).some((c) => c.id === travel.id)).toBe(false);
    expect(tasks.filter((t) => t.categoryId === 'personal')).toHaveLength(2);
  });
});
