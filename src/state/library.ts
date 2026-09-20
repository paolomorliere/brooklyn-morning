import type { LibraryEntry } from '@/types';
import { createStore } from './store';
import * as repo from '@/db/library';

export const DEFAULT_TAGS = ['Business idea', 'Travel', 'Learning', 'Read later'];

export const libraryStore = createStore<{ entries: LibraryEntry[]; ready: boolean }>({ entries: [], ready: false }, async () => ({ entries: await repo.allEntries(), ready: true }));

const reload = async () => libraryStore.set({ entries: await repo.allEntries(), ready: true });

export const libraryActions = {
  /** Save; if an entry with the same URL (or same lesson title) exists, return it instead of duplicating. */
  async save(e: Omit<LibraryEntry, 'id' | 'savedAt'>): Promise<{ entry: LibraryEntry; existed: boolean }> {
    await libraryStore.ensure();
    const dup = libraryStore.get().entries.find((x) => (e.url && x.url === e.url) || (e.kind === 'lesson' && x.kind === 'lesson' && x.title === e.title));
    if (dup) return { entry: dup, existed: true };
    const entry = await repo.putEntry(e);
    await reload();
    return { entry, existed: false };
  },
  async update(entry: LibraryEntry) {
    await repo.putEntry(entry);
    await reload();
  },
  async remove(id: string) {
    await repo.deleteEntry(id);
    await reload();
  },
  reload,
};
