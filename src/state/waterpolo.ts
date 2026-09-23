import type { PoloFeed } from '@/types';
import { createStore } from './store';
import { kvGet, kvSet } from '@/db/personal';
import { validFeed } from '@/lib/polo';

interface WaterPoloState {
  feed: PoloFeed | null;
  lastFetchAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  ready: boolean;
}

const REFRESH_MIN_MS = 10 * 60_000;
const base = () => import.meta.env.BASE_URL;

// The feed is re-downloadable, so it lives in `kv` alongside editions and lesson packs rather than
// in its own object store, and it is deliberately left out of the backup file.
export const waterPoloStore = createStore<WaterPoloState>(
  { feed: null, lastFetchAt: null, lastError: null, refreshing: false, ready: false },
  async () => ({
    feed: await kvGet<PoloFeed | null>('waterpolo:feed', null),
    lastFetchAt: await kvGet<string | null>('waterpolo:lastFetchAt', null),
    lastError: null,
    refreshing: false,
    ready: true,
  }),
);

const patch = (p: Partial<WaterPoloState>) => waterPoloStore.set({ ...waterPoloStore.get(), ...p });

export const waterPoloActions = {
  /**
   * Download the published results file. This never touches a school's website: the schools are
   * read by the weekend workflow, and the app only reads what that workflow published.
   * `manual` applies the same ten-minute throttle the edition uses.
   */
  async refresh(manual = false): Promise<void> {
    await waterPoloStore.ensure(); // never patch on top of a state that is still loading
    const s = waterPoloStore.get();
    if (s.refreshing) return;
    if (manual && s.lastFetchAt && Date.now() - new Date(s.lastFetchAt).getTime() < REFRESH_MIN_MS) {
      patch({ lastError: 'Checked less than 10 minutes ago. Sources are read on weekend mornings and afternoons.' });
      return;
    }
    patch({ refreshing: true, lastError: null });
    try {
      const r = await fetch(`${base()}data/waterpolo.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (!validFeed(data)) throw new Error('Results file is malformed');
      const current = waterPoloStore.get().feed;
      if (!current || current.builtAt !== data.builtAt) {
        await kvSet('waterpolo:feed', data);
        patch({ feed: data });
      }
      const at = new Date().toISOString();
      await kvSet('waterpolo:lastFetchAt', at);
      patch({ lastFetchAt: at, lastError: null });
    } catch (e) {
      patch({
        lastError:
          navigator.onLine === false
            ? 'You are offline. Showing the last saved results.'
            : `Couldn't refresh (${(e as Error).message}). Showing the last saved results.`,
      });
    } finally {
      patch({ refreshing: false });
    }
  },
};
