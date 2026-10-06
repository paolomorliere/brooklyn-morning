import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Task } from '@/types';
import { COMPLETED_TTL_MS, canMoveTask, expiredCompletedIds, moveCategory, moveTask, moveTaskBy, planCategoryRemoval, renumberTasks, sortOpen, validateCategoryName } from '@/lib/tasks';
import { _resetPersonalDB, DEFAULT_CATEGORIES } from '@/db/personal';
import { addCategory, addTask, allCategories, allTasks, completeTask, purgeExpiredCompleted, removeCategory, saveTaskOrder, uncompleteTask } from '@/db/tasks';

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

describe('manual task reordering (pure)', () => {
  const list = () => [
    mk('s1', { starred: true, order: 0 }),
    mk('s2', { starred: true, order: 1 }),
    mk('a', { order: 0 }),
    mk('b', { order: 1 }),
    mk('c', { order: 2 }),
  ];

  it('moves a task down inside its block and renumbers without gaps', () => {
    const next = moveTask(list(), 'a', 4);
    expect(sortOpen(next).map((t) => t.id)).toEqual(['s1', 's2', 'b', 'c', 'a']);
    expect(sortOpen(next).map((t) => t.order)).toEqual([0, 1, 0, 1, 2]);
  });

  it('moves a task up inside its block', () => {
    expect(sortOpen(moveTask(list(), 'c', 2)).map((t) => t.id)).toEqual(['s1', 's2', 'c', 'a', 'b']);
  });

  it('reorders the starred block independently', () => {
    expect(sortOpen(moveTask(list(), 's2', 0)).map((t) => t.id)).toEqual(['s2', 's1', 'a', 'b', 'c']);
  });

  it('clamps an unstarred task to the top of its own block, never into the stars', () => {
    // Index 0 is inside the starred block; the move must stop at the first unstarred position.
    const next = sortOpen(moveTask(list(), 'c', 0));
    expect(next.map((t) => t.id)).toEqual(['s1', 's2', 'c', 'a', 'b']);
    expect(next.filter((t) => t.starred).map((t) => t.id)).toEqual(['s1', 's2']);
  });

  it('clamps a starred task to the bottom of the starred block', () => {
    expect(sortOpen(moveTask(list(), 's1', 4)).map((t) => t.id)).toEqual(['s2', 's1', 'a', 'b', 'c']);
  });

  it('is a no-op for an unknown id, and still returns a gap-free order', () => {
    const next = moveTask([mk('a', { order: 7 }), mk('b', { order: 9 })], 'nope', 0);
    expect(next.map((t) => [t.id, t.order])).toEqual([['a', 0], ['b', 1]]);
  });

  it('moveTaskBy steps one place and stops at the block edges', () => {
    expect(sortOpen(moveTaskBy(list(), 'b', -1)).map((t) => t.id)).toEqual(['s1', 's2', 'b', 'a', 'c']);
    expect(sortOpen(moveTaskBy(list(), 'a', -1)).map((t) => t.id)).toEqual(['s1', 's2', 'a', 'b', 'c']);
    expect(sortOpen(moveTaskBy(list(), 'c', 1)).map((t) => t.id)).toEqual(['s1', 's2', 'a', 'b', 'c']);
  });

  it('canMoveTask refuses to cross the star boundary or the ends', () => {
    const l = list();
    expect(canMoveTask(l, 's1', -1)).toBe(false);
    expect(canMoveTask(l, 's1', 1)).toBe(true);
    expect(canMoveTask(l, 's2', 1)).toBe(false); // would land on an unstarred task
    expect(canMoveTask(l, 'a', -1)).toBe(false); // would land on a starred task
    expect(canMoveTask(l, 'a', 1)).toBe(true);
    expect(canMoveTask(l, 'c', 1)).toBe(false);
    expect(canMoveTask(l, 'missing', 1)).toBe(false);
  });

  it('numbers each block from zero so sortOpen is unambiguous', () => {
    const r = renumberTasks([mk('s', { starred: true, order: 50 }), mk('x', { order: 50 }), mk('y', { order: 50 })]);
    expect(r.map((t) => [t.id, t.order])).toEqual([['s', 0], ['x', 0], ['y', 1]]);
  });

  it('survives a repeated move: the order after n moves is still 0..n-1', () => {
    let l = list();
    for (const id of ['a', 'b', 'c', 'a', 'c']) l = moveTask(l, id, 2);
    const plain = sortOpen(l).filter((t) => !t.starred);
    expect(plain.map((t) => t.order)).toEqual([0, 1, 2]);
    expect(new Set(plain.map((t) => t.id)).size).toBe(3);
  });
});

describe('manual task order on disk', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetPersonalDB();
  });

  it('writes only order, leaving an edit made during the drag alone', async () => {
    const a = await addTask('A', 'inbox');
    const b = await addTask('B', 'inbox');
    // Simulates the task being starred while the finger was still down on the other one.
    await completeTask(b.id, new Date('2026-09-19T08:00:00Z'));
    await saveTaskOrder(moveTask([a, b], a.id, 1));
    const after = await allTasks();
    expect(after.find((t) => t.id === b.id)?.completedAt).toBe('2026-09-19T08:00:00.000Z');
    expect(after.find((t) => t.id === a.id)?.order).toBe(1);
  });

  it('ignores a task that was deleted before the write landed', async () => {
    const a = await addTask('A', 'inbox');
    const ghost = { ...a, id: 'gone', order: 0 };
    await expect(saveTaskOrder([ghost, { ...a, order: 1 }])).resolves.toBeUndefined();
    expect((await allTasks()).map((t) => t.id)).toEqual([a.id]);
  });
});
