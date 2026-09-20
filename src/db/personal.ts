import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Category, Favorite, HistoryEvent, LessonProgress, LibraryEntry, ListItem, Prefs, Task } from '@/types';

// All personal data. Never contains catalog rows; the catalog has its own database.
export interface PersonalDB extends DBSchema {
  tasks: { key: string; value: Task; indexes: { byCategory: string } };
  categories: { key: string; value: Category };
  list: { key: string; value: ListItem };
  history: { key: string; value: HistoryEvent; indexes: { byAt: string } };
  library: { key: string; value: LibraryEntry };
  favorites: { key: string; value: Favorite };
  kv: { key: string; value: { key: string; value: unknown } };
}

export const PERSONAL_DB = 'brooklyn-personal';
export const PERSONAL_VERSION = 2;
export const STORES = ['tasks', 'categories', 'list', 'history', 'library', 'favorites', 'kv'] as const;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'inbox', name: 'Inbox', order: 0, system: true },
  { id: 'sfc', name: 'SFC Institutional Research', order: 1 },
  { id: 'liu', name: 'LIU Water Polo', order: 2 },
  { id: 'ms', name: 'MS Coursework', order: 3 },
  { id: 'biz', name: 'Business Ideas', order: 4 },
  { id: 'personal', name: 'Personal', order: 5 },
];

export const DEFAULT_PREFS: Prefs = {
  storiesPerSection: 3,
  topicsEnabled: { ai: true, world: true, finance: true, waterpolo: true, soccer: true },
  lastBackupAt: null,
  hiddenSuggestions: [],
};

let dbPromise: Promise<IDBPDatabase<PersonalDB>> | null = null;

export function personalDB(): Promise<IDBPDatabase<PersonalDB>> {
  dbPromise ??= openDB<PersonalDB>(PERSONAL_DB, PERSONAL_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('byCategory', 'categoryId');
        db.createObjectStore('categories', { keyPath: 'id' });
        db.createObjectStore('list', { keyPath: 'id' });
        const history = db.createObjectStore('history', { keyPath: 'id' });
        history.createIndex('byAt', 'at');
        db.createObjectStore('library', { keyPath: 'id' });
        db.createObjectStore('kv', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('favorites', { keyPath: 'key' });
      }
    },
  }).then(async (db) => {
    // Seed default categories once, in a single transaction.
    const tx = db.transaction('categories', 'readwrite');
    if ((await tx.store.count()) === 0) {
      for (const c of DEFAULT_CATEGORIES) tx.store.put(c);
    }
    await tx.done;
    return db;
  });
  return dbPromise;
}

/** Test helper: forget the cached connection so a fresh database can be opened. */
export function _resetPersonalDB() {
  dbPromise = null;
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const db = await personalDB();
  const row = await db.get('kv', key);
  return row ? (row.value as T) : fallback;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await personalDB();
  await db.put('kv', { key, value });
}

export const getPrefs = () => kvGet<Prefs>('prefs', DEFAULT_PREFS).then((p) => ({ ...DEFAULT_PREFS, ...p }));
export const setPrefs = (p: Prefs) => kvSet('prefs', p);
export const getLessonProgress = () => kvGet<LessonProgress | null>('lessonProgress', null);
export const setLessonProgress = (p: LessonProgress) => kvSet('lessonProgress', p);

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
