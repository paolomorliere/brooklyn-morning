import type { Poll } from '@/types';
import { createStore } from './store';
import { kvGet, kvSet } from '@/db/personal';
import { validPoll } from '@/lib/polo';

interface PollState {
  poll: Poll | null;
  lastFetchAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  ready: boolean;
}

const REFRESH_MIN_MS = 10 * 60_000;
const base = () => import.meta.env.BASE_URL;

/**
 * The poll's own workflow page. collegiatewaterpolo.org sends no CORS headers either, so a manual
 * poll check is the same arrangement as the scores: open the workflow, tap Run workflow, and let
 * the app read what the job publishes. This is deliberately NOT the water polo results workflow —
 * that one does not fetch polls, and the poll job does not fetch scores.
 */
export const POLL_RUN_URL = 'https://github.com/paolomorliere/brooklyn-morning/actions/workflows/poll.yml';

// Re-downloadable, so it lives in `kv` with the other published files and stays out of the backup.
export const pollStore = createStore<PollState>(
  { poll: null, lastFetchAt: null, lastError: null, refreshing: false, ready: false },
  async () => ({
    poll: await kvGet<Poll | null>('poll:latest', null),
    lastFetchAt: await kvGet<string | null>('poll:lastFetchAt', null),
    lastError: null,
    refreshing: false,
    ready: true,
  }),
);

const patch = (p: Partial<PollState>) => pollStore.set({ ...pollStore.get(), ...p });

export const pollActions = {
  /**
   * Download the published poll file. This never touches collegiatewaterpolo.org: the CWPA is read
   * by the Wednesday workflow, and the app only reads what that workflow published.
   */
  async refresh(manual = false): Promise<void> {
    await pollStore.ensure();
    const s = pollStore.get();
    if (s.refreshing) return;
    if (manual && s.lastFetchAt && Date.now() - new Date(s.lastFetchAt).getTime() < REFRESH_MIN_MS) {
      patch({ lastError: 'Checked less than 10 minutes ago. The poll is read on Wednesday evenings.' });
      return;
    }
    patch({ refreshing: true, lastError: null });
    try {
      const r = await fetch(`${base()}data/poll.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (!validPoll(data)) throw new Error('Poll file is malformed');
      const current = pollStore.get().poll;
      // An older week can never replace a newer one, even if the file somehow regressed.
      if (current && current.season === data.season && current.week > data.week) {
        patch({ lastError: null });
      } else if (!current || current.builtAt !== data.builtAt || current.lastAttemptAt !== data.lastAttemptAt) {
        await kvSet('poll:latest', data);
        patch({ poll: data });
      }
      const at = new Date().toISOString();
      await kvSet('poll:lastFetchAt', at);
      patch({ lastFetchAt: at, lastError: null });
    } catch (e) {
      patch({
        lastError:
          navigator.onLine === false
            ? 'You are offline. Showing the last saved poll.'
            : `Couldn't refresh (${(e as Error).message}). Showing the last saved poll.`,
      });
    } finally {
      patch({ refreshing: false });
    }
  },
};
