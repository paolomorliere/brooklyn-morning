import { DEFAULT_PREFS, getLessonProgress, getPrefs, personalDB, STORES } from './personal';
import { BACKUP_SCHEMA, validateBackup, type Backup } from '@/lib/backup';

export async function exportBackup(): Promise<Backup> {
  const db = await personalDB();
  const tx = db.transaction(STORES, 'readonly');
  const [tasks, categories, list, history, library] = await Promise.all([
    tx.objectStore('tasks').getAll(),
    tx.objectStore('categories').getAll(),
    tx.objectStore('list').getAll(),
    tx.objectStore('history').getAll(),
    tx.objectStore('library').getAll(),
  ]);
  await tx.done;
  return {
    app: 'brooklyn-morning',
    schemaVersion: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    tasks,
    categories,
    list,
    history,
    library,
    prefs: await getPrefs(),
    lessonProgress: await getLessonProgress(),
  };
}

/** Replace all personal data with the backup, in one transaction. Throws (and changes nothing) if invalid. */
export async function restoreBackup(data: unknown): Promise<Backup> {
  const problems = validateBackup(data);
  if (problems.length) throw new Error(problems.slice(0, 3).join('; '));
  const b = data as Backup;
  const db = await personalDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  for (const t of b.tasks) tx.objectStore('tasks').put(t);
  for (const c of b.categories) tx.objectStore('categories').put(c);
  for (const it of b.list) tx.objectStore('list').put(it);
  for (const h of b.history) tx.objectStore('history').put(h);
  for (const e of b.library) tx.objectStore('library').put(e);
  tx.objectStore('kv').put({ key: 'prefs', value: { ...DEFAULT_PREFS, ...(b.prefs ?? {}) } });
  if (b.lessonProgress) tx.objectStore('kv').put({ key: 'lessonProgress', value: b.lessonProgress });
  await tx.done;
  return b;
}
