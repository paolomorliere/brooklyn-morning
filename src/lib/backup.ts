import type { Category, Favorite, HistoryEvent, LessonProgress, LibraryEntry, ListItem, Prefs, Task } from '@/types';

export const BACKUP_SCHEMA = 1;

export interface Backup {
  app: 'brooklyn-morning';
  schemaVersion: typeof BACKUP_SCHEMA;
  exportedAt: string;
  tasks: Task[];
  categories: Category[];
  list: ListItem[];
  history: HistoryEvent[];
  library: LibraryEntry[];
  favorites?: Favorite[]; // added after the first release; older backups omit it
  prefs: Prefs;
  lessonProgress: LessonProgress | null;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isArr = Array.isArray;

/** Structural validation of a parsed backup. Returns a list of problems; empty means valid. */
export function validateBackup(data: unknown): string[] {
  const p: string[] = [];
  if (!data || typeof data !== 'object') return ['Not a JSON object'];
  const b = data as Record<string, unknown>;
  if (b.app !== 'brooklyn-morning') p.push('Not a Brooklyn Morning backup');
  if (b.schemaVersion !== BACKUP_SCHEMA) p.push(`Unsupported schema version ${String(b.schemaVersion)}`);
  for (const k of ['tasks', 'categories', 'list', 'history', 'library'] as const) {
    if (!isArr(b[k])) p.push(`Missing ${k}`);
  }
  if (p.length) return p;
  const tasks = b.tasks as Task[];
  const cats = b.categories as Category[];
  const catIds = new Set(cats.map((c) => c.id));
  if (!cats.some((c) => c.system)) p.push('No Inbox category');
  cats.forEach((c, i) => {
    if (!isStr(c.id) || !isStr(c.name)) p.push(`Category ${i} malformed`);
  });
  tasks.forEach((t, i) => {
    if (!isStr(t.id) || !isStr(t.text) || !isStr(t.categoryId)) p.push(`Task ${i} malformed`);
    else if (!catIds.has(t.categoryId)) p.push(`Task "${t.text}" points to a missing category`);
    if (t.completedAt !== null && !isStr(t.completedAt)) p.push(`Task ${i} has an invalid completedAt`);
  });
  (b.list as ListItem[]).forEach((it, i) => {
    if (!isStr(it.id) || !isStr(it.name) || typeof it.qty !== 'number') p.push(`List item ${i} malformed`);
  });
  (b.history as HistoryEvent[]).forEach((h, i) => {
    if (!isStr(h.id) || !['added', 'purchased'].includes(h.kind) || !isStr(h.at)) p.push(`History event ${i} malformed`);
  });
  (b.library as LibraryEntry[]).forEach((e, i) => {
    if (!isStr(e.id) || !isStr(e.title)) p.push(`Library entry ${i} malformed`);
  });
  if (b.favorites !== undefined) {
    if (!isArr(b.favorites)) p.push('Favorites malformed');
    else (b.favorites as Favorite[]).forEach((f, i) => { if (!isStr(f.key) || !isStr(f.name)) p.push(`Favorite ${i} malformed`); });
  }
  if (b.prefs !== undefined && (typeof b.prefs !== 'object' || b.prefs === null)) p.push('Prefs malformed');
  return p;
}

export function summarizeBackup(b: Backup): string {
  return `${b.tasks.length} tasks · ${b.categories.length} categories · ${b.list.length} list items · ${b.history.length} history events · ${(b.favorites ?? []).length} favorites · ${b.library.length} library entries`;
}

export function backupFilename(date = new Date()): string {
  return `brooklyn-morning-backup-${date.toISOString().slice(0, 10)}.json`;
}
