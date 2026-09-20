import type { Edition } from '@/types';
import { createStore } from './store';
import { kvGet, kvSet } from '@/db/personal';

export interface GlossaryTerm { id: string; term: string; definition: string }

interface EditionState {
  edition: Edition | null;
  archiveDates: string[];
  glossary: GlossaryTerm[];
  lastFetchAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  ready: boolean;
}

const REFRESH_MIN_MS = 10 * 60_000;
const KEEP = 14;
const base = () => import.meta.env.BASE_URL;

export const editionStore = createStore<EditionState>(
  { edition: null, archiveDates: [], glossary: [], lastFetchAt: null, lastError: null, refreshing: false, ready: false },
  async () => ({
    edition: await kvGet<Edition | null>('edition:current', null),
    archiveDates: await kvGet<string[]>('edition:dates', []),
    glossary: await kvGet<GlossaryTerm[]>('glossary', []),
    lastFetchAt: await kvGet<string | null>('edition:lastFetchAt', null),
    lastError: null,
    refreshing: false,
    ready: true,
  }),
);

const patch = (p: Partial<EditionState>) => editionStore.set({ ...editionStore.get(), ...p });

function validEdition(e: unknown): e is Edition {
  const x = e as Partial<Edition>;
  return !!x && x.schemaVersion === 1 && typeof x.date === 'string' && typeof x.preparedAt === 'string' && Array.isArray(x.stories) && Array.isArray(x.sources);
}

export const editionActions = {
  /** Fetch the latest edition. `manual` enforces the 10-minute throttle; automatic calls are cheap (304/etag) and unthrottled. */
  async refresh(manual = false): Promise<void> {
    await editionStore.ensure(); // never patch on top of a state that is still loading
    const s = editionStore.get();
    if (s.refreshing) return;
    if (manual && s.lastFetchAt && Date.now() - new Date(s.lastFetchAt).getTime() < REFRESH_MIN_MS) {
      patch({ lastError: 'Checked less than 10 minutes ago. Editions are prepared once a day, around 5:50 AM.' });
      return;
    }
    patch({ refreshing: true, lastError: null });
    try {
      const r = await fetch(`${base()}data/edition.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (!validEdition(data)) throw new Error('Edition file is malformed');
      const cur = editionStore.get().edition;
      if (!cur || cur.preparedAt !== data.preparedAt) {
        await kvSet('edition:current', data);
        await kvSet(`edition:${data.date}`, data);
        const dates = [...new Set([data.date, ...editionStore.get().archiveDates])].sort().reverse().slice(0, KEEP);
        await kvSet('edition:dates', dates);
        patch({ edition: data, archiveDates: dates });
      }
      if (editionStore.get().glossary.length === 0) await editionActions.loadGlossary();
      const at = new Date().toISOString();
      await kvSet('edition:lastFetchAt', at);
      patch({ lastFetchAt: at, lastError: null });
    } catch (e) {
      patch({ lastError: navigator.onLine === false ? 'You are offline. Showing the last saved edition.' : `Couldn't refresh (${(e as Error).message}). Showing the last saved edition.` });
    } finally {
      patch({ refreshing: false });
    }
  },
  async loadGlossary() {
    await editionStore.ensure();
    try {
      const r = await fetch(`${base()}data/glossary.json`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return;
      const g = (await r.json()) as { terms: GlossaryTerm[] };
      await kvSet('glossary', g.terms);
      patch({ glossary: g.terms });
    } catch { /* keep whatever we had */ }
  },
  async loadArchived(date: string): Promise<Edition | null> {
    return kvGet<Edition | null>(`edition:${date}`, null);
  },
};
