import type { StockFeed, StockRecap } from '@/types';
import { createStore } from './store';
import { kvGet, kvSet } from '@/db/personal';

/**
 * The stock picks' track record, read from the file the stocks workflow publishes every morning.
 *
 * Nothing here is computed from prices: the build measures every position (`recaps` in
 * `data/stock.json`) and the app only reads it. The file is re-downloadable, so it lives in `kv` with
 * the other published files and stays out of the backup.
 */

interface PicksState {
  recaps: StockRecap[];
  /** The file's own `builtAt`, so "updated" means when the build ran, not when this phone fetched it. */
  builtAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  ready: boolean;
}

const base = () => import.meta.env.BASE_URL;
/** Re-reading the same daily file more often than this is a fetch for nothing. */
const REFRESH_MIN_MS = 10 * 60_000;
let lastFetchAt = 0;

/** A recap is only believed if it has the shape the build writes. */
export function validRecaps(data: unknown): data is Pick<StockFeed, 'builtAt' | 'recaps'> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<StockFeed>;
  return (
    typeof d.builtAt === 'string' &&
    Array.isArray(d.recaps) &&
    d.recaps.every(
      (r) =>
        r?.kind === 'recap' &&
        (r.strategyVersion === 1 || r.strategyVersion === 2) &&
        typeof r.asOf === 'string' &&
        Array.isArray(r.rows),
    )
  );
}

export const picksStore = createStore<PicksState>(
  { recaps: [], builtAt: null, lastError: null, refreshing: false, ready: false },
  async () => ({
    recaps: await kvGet<StockRecap[]>('stock:recaps', []),
    builtAt: await kvGet<string | null>('stock:recapsBuiltAt', null),
    lastError: null,
    refreshing: false,
    ready: true,
  }),
);

const patch = (p: Partial<PicksState>) => picksStore.set({ ...picksStore.get(), ...p });

export const picksActions = {
  async refresh(force = false): Promise<void> {
    await picksStore.ensure();
    if (picksStore.get().refreshing) return;
    if (!force && Date.now() - lastFetchAt < REFRESH_MIN_MS) return;
    patch({ refreshing: true, lastError: null });
    try {
      const r = await fetch(`${base()}data/stock.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (!validRecaps(data)) throw new Error('the stock file is malformed');
      lastFetchAt = Date.now();
      // An older build never replaces a newer one.
      const current = picksStore.get().builtAt;
      if (!current || data.builtAt >= current) {
        await kvSet('stock:recaps', data.recaps);
        await kvSet('stock:recapsBuiltAt', data.builtAt);
        patch({ recaps: data.recaps, builtAt: data.builtAt });
      }
    } catch (e) {
      patch({
        lastError:
          navigator.onLine === false
            ? 'You are offline. Showing the last saved record.'
            : `Couldn't update the record (${(e as Error).message}). Showing the last saved one.`,
      });
    } finally {
      patch({ refreshing: false });
    }
  },
};
