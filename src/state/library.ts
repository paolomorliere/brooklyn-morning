import type { Edition, LibraryEntry } from '@/types';
import { createStore } from './store';
import * as repo from '@/db/library';
import { repairEntries } from '@/lib/library-repair';
import { kvGet } from '@/db/personal';
import { lessonStore } from './lessons';

export const DEFAULT_TAGS = ['Business idea', 'Travel', 'Learning', 'Read later'];

export const libraryStore = createStore<{ entries: LibraryEntry[]; ready: boolean }>({ entries: [], ready: false }, async () => ({ entries: await repo.allEntries(), ready: true }));

const reload = async () => libraryStore.set({ entries: await repo.allEntries(), ready: true });

export const libraryActions = {
  /**
   * Give existing saved items a content reference so they can be read.
   *
   * Runs once per app open, is additive, and writes only the entries it can actually improve — it
   * never deletes, never recreates and never rewrites a title, note or tag. An entry it cannot
   * resolve is marked with the reason so the reader can say what is missing instead of opening
   * blank.
   */
  async repair(): Promise<{ repaired: number; unresolved: number }> {
    await libraryStore.ensure();
    await lessonStore.ensure();
    const entries = libraryStore.get().entries;
    if (entries.every((e) => e.ref || e.contentMissing)) return { repaired: 0, unresolved: 0 };

    const dates = await kvGet<string[]>('edition:dates', []);
    const current = await kvGet<Edition | null>('edition:current', null);
    const archived = (await Promise.all(dates.map((d) => kvGet<Edition | null>(`edition:${d}`, null)))).filter(Boolean) as Edition[];
    const editions = current ? [current, ...archived.filter((e) => e.date !== current.date)] : archived;

    const { updated, repaired, unresolved } = repairEntries(entries, lessonStore.get().packs, editions);
    for (const e of updated) await repo.putEntry(e);
    if (updated.length) await reload();
    return { repaired, unresolved };
  },

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
