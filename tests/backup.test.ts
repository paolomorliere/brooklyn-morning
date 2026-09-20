import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetPersonalDB, getLessonProgress, personalDB, setLessonProgress, setPrefs, DEFAULT_PREFS } from '@/db/personal';
import { addCategory, addTask, allCategories, allTasks, completeTask } from '@/db/tasks';
import { exportBackup, restoreBackup } from '@/db/backup';
import { validateBackup } from '@/lib/backup';

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
