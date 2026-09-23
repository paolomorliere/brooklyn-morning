import type { PoloFeed } from '@/types';
import { createStore } from './store';
import { kvGet, kvSet } from '@/db/personal';
import { validFeed } from '@/lib/polo';

/** What a manual "check sources now" is doing, and what it is honest to say about it. */
export type WatchPhase = 'idle' | 'waiting' | 'updated' | 'unchanged' | 'timeout';

export interface WatchState {
  phase: WatchPhase;
  startedAt: string;
  /** Games added since the watch began. Only ever counted from two real feed files. */
  added: number;
  /** Schools the new build could read, when it finished. */
  okCount: number;
  total: number;
  failed: string[];
}

interface WaterPoloState {
  feed: PoloFeed | null;
  lastFetchAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  ready: boolean;
  watch: WatchState | null;
  /** Epoch ms until which the manual button stays disabled. */
  cooldownUntil: number;
}

const REFRESH_MIN_MS = 10 * 60_000;
const base = () => import.meta.env.BASE_URL;

/**
 * Where a manual check actually happens.
 *
 * No school and no conference sends CORS headers, so the phone can never read a source directly.
 * The ingestion lives in GitHub Actions, and triggering it from the browser without a server would
 * mean putting a token in client code — which the brief rules out. So the button opens the
 * workflow's own page, Paolo taps Run workflow once, and the app then watches the published file
 * for a newer build.
 */
export const RUN_URL = 'https://github.com/paolomorliere/brooklyn-morning/actions/workflows/waterpolo.yml';

/** How long the app keeps watching for a new build, and how often it looks. */
const WATCH_EVERY_MS = 20_000;
const WATCH_FOR_MS = 12 * 60_000;
const COOLDOWN_MS = 30_000;

// The feed is re-downloadable, so it lives in `kv` alongside editions and lesson packs rather than
// in its own object store, and it is deliberately left out of the backup file.
export const waterPoloStore = createStore<WaterPoloState>(
  { feed: null, lastFetchAt: null, lastError: null, refreshing: false, ready: false, watch: null, cooldownUntil: 0 },
  async () => ({
    feed: await kvGet<PoloFeed | null>('waterpolo:feed', null),
    lastFetchAt: await kvGet<string | null>('waterpolo:lastFetchAt', null),
    lastError: null,
    refreshing: false,
    ready: true,
    watch: null,
    cooldownUntil: 0,
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

/**
 * One watcher at a time. Tapping the button again re-opens the workflow page — which is what Paolo
 * wants if he lost the tab — but never starts a second polling loop.
 */
let watching: number | null = null;

/** Download the feed without touching the store, so the watcher can compare before it replaces. */
async function downloadFeed(): Promise<PoloFeed | null> {
  try {
    const r = await fetch(`${base()}data/waterpolo.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const data: unknown = await r.json();
    return validFeed(data) ? data : null;
  } catch {
    return null;
  }
}

export const waterPoloRefresh = {
  /**
   * Open the workflow page and start watching for the build it produces.
   *
   * Nothing here reaches a school or the CWPA, and no credential is involved: the app only ever
   * reads its own published results file.
   */
  checkNow(): void {
    const s = waterPoloStore.get();
    window.open(RUN_URL, '_blank', 'noopener,noreferrer');
    patch({ cooldownUntil: Date.now() + COOLDOWN_MS });
    if (watching !== null) return; // already watching; the tap just re-opened the page

    const before = s.feed;
    const startedAt = new Date().toISOString();
    const deadline = Date.now() + WATCH_FOR_MS;
    patch({
      watch: { phase: 'waiting', startedAt, added: 0, okCount: 0, total: before?.sources.length ?? 0, failed: [] },
      lastError: null,
    });

    watching = window.setInterval(async () => {
      const next = await downloadFeed();
      const current = waterPoloStore.get();
      const stale = !next || (before && next.builtAt === before.builtAt);

      if (stale) {
        if (Date.now() < deadline) return;
        window.clearInterval(watching!);
        watching = null;
        patch({ watch: { ...current.watch!, phase: 'timeout' } });
        return;
      }

      window.clearInterval(watching!);
      watching = null;
      await kvSet('waterpolo:feed', next);
      const at = new Date().toISOString();
      await kvSet('waterpolo:lastFetchAt', at);
      const failed = next.sources.filter((x) => !x.ok);
      // "New results", not "new games": a game that was already there and has only been corrected
      // is not new, and claiming otherwise would overstate what the run found.
      const had = new Set((before?.games ?? []).map((g) => g.id));
      const added = next.games.filter((g) => !had.has(g.id)).length;
      patch({
        feed: next,
        lastFetchAt: at,
        watch: {
          ...current.watch!,
          phase: added > 0 ? 'updated' : 'unchanged',
          added,
          okCount: next.sources.length - failed.length,
          total: next.sources.length,
          failed: failed.map((x) => x.display),
        },
      });
    }, WATCH_EVERY_MS);
  },

  /** Dismiss the watch banner. Stops the loop if it is still running. */
  clear(): void {
    if (watching !== null) {
      window.clearInterval(watching);
      watching = null;
    }
    patch({ watch: null });
  },
};
