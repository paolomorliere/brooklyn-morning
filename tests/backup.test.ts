import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetPersonalDB, getLessonProgress, personalDB, setLessonProgress, setPrefs, DEFAULT_PREFS } from '@/db/personal';
import { addCategory, addTask, allCategories, allTasks, completeTask, saveTaskOrder } from '@/db/tasks';
import { exportBackup, restoreBackup } from '@/db/backup';
import { repairTaskOrders, validateBackup } from '@/lib/backup';
import { moveTask, sortOpen } from '@/lib/tasks';

describe('backup round trip', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetPersonalDB();
  });

  it('exports and restores every personal store faithfully', async () => {
    const travel = await addCategory('Travel');
    const t1 = await addTask('Book flight', travel.id);
    const t2 = await addTask('Done thing', 'personal');
    await completeTask(t2.id, new Date('2026-09-19T08:00:00Z'));
    const db = await personalDB();
    await db.put('history', { id: 'h1', productId: 'p1', name: 'Bread', section: 'Bakery', imageUrl: null, kind: 'purchased', at: '2026-09-18T10:00:00Z' });
    await db.put('list', { id: 'l1', productId: null, name: 'Bananas', size: '', section: 'Other', imageUrl: null, qty: 6, addedAt: '2026-09-19T00:00:00Z' });
    await db.put('library', { id: 'e1', kind: 'own', title: 'Idea', url: null, note: 'n', tags: ['Business idea'], savedAt: '2026-09-19T00:00:00Z' });
    await setPrefs({ ...DEFAULT_PREFS, storiesPerSection: 5 });
    await setLessonProgress({ startMonday: '2026-09-14', readLessonIds: ['week-01-d1'] });

    const backup = await exportBackup();
    expect(validateBackup(backup)).toEqual([]);
    const json = JSON.parse(JSON.stringify(backup));

    // Wipe and restore into a fresh database.
    indexedDB = new IDBFactory();
    _resetPersonalDB();
    await restoreBackup(json);

    const tasks = await allTasks();
    expect(tasks.find((t) => t.id === t1.id)?.categoryId).toBe(travel.id);
    expect(tasks.find((t) => t.id === t2.id)?.completedAt).toBe('2026-09-19T08:00:00.000Z');
    expect((await allCategories()).map((c) => c.name)).toContain('Travel');
    expect(await (await personalDB()).getAll('history')).toHaveLength(1);
    expect((await (await personalDB()).get('list', 'l1'))?.qty).toBe(6);
    expect((await (await personalDB()).get('library', 'e1'))?.tags).toEqual(['Business idea']);
    expect(await getLessonProgress()).toEqual({ startMonday: '2026-09-14', readLessonIds: ['week-01-d1'] });
    const prefs = (await (await personalDB()).get('kv', 'prefs'))?.value as { storiesPerSection: number };
    expect(prefs.storiesPerSection).toBe(5);
  });

  it('rejects malformed input without touching existing data', async () => {
    await addTask('Keep me', 'inbox');
    await expect(restoreBackup({ app: 'other' })).rejects.toThrow();
    await expect(restoreBackup({ app: 'brooklyn-morning', schemaVersion: 1, tasks: [{ id: 'x', text: 'y', categoryId: 'ghost', completedAt: null }], categories: [{ id: 'inbox', name: 'Inbox', order: 0, system: true }], list: [], history: [], library: [] })).rejects.toThrow(/missing category/);
    expect(await allTasks()).toHaveLength(1);
  });
});

describe('favorites', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetPersonalDB();
  });
  it('toggles, survives a backup round trip, and accepts old backups without favorites', async () => {
    const { toggleFavorite, allFavorites } = await import('@/db/grocery');
    const item = { productId: 'p1', name: 'Sourdough', size: '24 oz', section: 'Bakery' as const, imageUrl: null };
    expect(await toggleFavorite(item)).toBe(true);
    expect(await toggleFavorite({ productId: null, name: '  Bananas ', section: 'Produce', imageUrl: null })).toBe(true);
    expect((await allFavorites()).map((f) => f.key).sort()).toEqual(['other:bananas', 'p1']);
    const b = await exportBackup();
    expect(b.favorites).toHaveLength(2);
    indexedDB = new IDBFactory();
    _resetPersonalDB();
    await restoreBackup(JSON.parse(JSON.stringify(b)));
    expect(await allFavorites()).toHaveLength(2);
    expect(await toggleFavorite(item)).toBe(false);
    expect(await allFavorites()).toHaveLength(1);
    const { favorites: _f, ...old } = b;
    expect(validateBackup(old)).toEqual([]);
  });
});

describe('manual order survives a restore', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    _resetPersonalDB();
  });

  it('round-trips a hand-made order and keeps the list in that order', async () => {
    const a = await addTask('First', 'inbox');
    const b = await addTask('Second', 'inbox');
    const c = await addTask('Third', 'inbox');
    await saveTaskOrder(moveTask([a, b, c], c.id, 0));
    const before = sortOpen(await allTasks()).map((t) => t.text);
    expect(before).toEqual(['Third', 'First', 'Second']);

    const json = JSON.parse(JSON.stringify(await exportBackup()));
    indexedDB = new IDBFactory();
    _resetPersonalDB();
    await restoreBackup(json);

    expect(sortOpen(await allTasks()).map((t) => t.text)).toEqual(before);
  });

  it('repairs a missing order instead of letting NaN randomise the list', async () => {
    await addTask('One', 'inbox');
    await addTask('Two', 'inbox');
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    // A backup written before manual ordering existed, or edited by hand.
    for (const t of backup.tasks) delete t.order;
    for (const c of backup.categories) delete c.order;

    indexedDB = new IDBFactory();
    _resetPersonalDB();
    await restoreBackup(backup);

    const tasks = await allTasks();
    expect(tasks.every((t) => Number.isFinite(t.order))).toBe(true);
    expect(sortOpen(tasks).map((t) => t.order)).toEqual([0, 1]);
    const cats = await allCategories();
    expect(cats.map((c) => c.order)).toEqual(cats.map((_, i) => i));
  });

  it('falls back to creation order when order is missing', () => {
    // Two tasks created in the same millisecond have no defined relative order, with or without
    // this repair, so the fixture uses distinct times — which is the case that actually matters.
    const base = { text: 't', notes: '', completedAt: null, categoryId: 'inbox', starred: false };
    const repaired = repairTaskOrders([
      { ...base, id: 'newer', createdAt: '2026-09-19T12:00:00Z', order: undefined as unknown as number },
      { ...base, id: 'older', createdAt: '2026-09-19T09:00:00Z', order: undefined as unknown as number },
    ]);
    expect(sortOpen(repaired).map((t) => t.id)).toEqual(['older', 'newer']);
  });

  it('numbers each category and each star block from zero', () => {
    const base = { text: 't', notes: '', completedAt: null, createdAt: '2026-09-19T10:00:00Z' };
    const repaired = repairTaskOrders([
      { ...base, id: 'i1', categoryId: 'inbox', starred: false, order: 40 },
      { ...base, id: 'i2', categoryId: 'inbox', starred: false, order: 10 },
      { ...base, id: 'i3', categoryId: 'inbox', starred: true, order: 90 },
      { ...base, id: 'w1', categoryId: 'work', starred: false, order: 5 },
    ]);
    const by = (id: string) => repaired.find((t) => t.id === id)?.order;
    expect([by('i2'), by('i1')]).toEqual([0, 1]);
    expect(by('i3')).toBe(0);
    expect(by('w1')).toBe(0);
  });
});
