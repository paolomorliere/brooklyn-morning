import type { LibraryEntry } from '@/types';
import { newId, personalDB } from './personal';

export async function allEntries(): Promise<LibraryEntry[]> {
  return (await personalDB()).getAll('library');
}
export async function putEntry(e: Omit<LibraryEntry, 'id' | 'savedAt'> & { id?: string; savedAt?: string }): Promise<LibraryEntry> {
  const db = await personalDB();
  const full: LibraryEntry = { ...e, id: e.id ?? newId(), savedAt: e.savedAt ?? new Date().toISOString() };
  await db.put('library', full);
  return full;
}
export async function deleteEntry(id: string): Promise<void> {
  await (await personalDB()).delete('library', id);
}
