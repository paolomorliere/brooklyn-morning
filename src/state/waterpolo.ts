import type { PoloFeed } from '@/types';
import { createStore } from './store';
import { kvGet, kvSet } from '@/db/personal';
import { isFinal, isUpcoming, validFeed } from '@/lib/polo';

/**
 * Where a manual check actually happens.
 *
 * No school and no conference sends CORS headers, so the phone can never read a source directly.
 * The ingestion lives in GitHub Actions, and triggering it from the browser without a server would
 * mean putting a token in client code — which the brief rules out. So the button opens the
 * workflow's own page, Paolo taps Run workflow once, and the app watches from there.
 */
const OWNER = 'paolomorliere';
const REPO = 'brooklyn-morning';
export const RUN_URL = `https://github.com/${OWNER}/${REPO}/actions/workflows/waterpolo.yml`;

/**
 * The run's own status, read from GitHub's public REST API.
 *
 * Unauthenticated, CORS-enabled, 60 requests an hour per address, no key and no account — it cannot
 * bill. It is what turns "I tapped something and I don't know what happened" into real states:
 * queued, running, succeeded, failed. If it is unreachable or rate-limited the watcher falls back
 * to watching the published file, which is the only thing that decides success anyway.
 */
const RUNS_API = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/waterpolo.yml/runs?per_page=5`;

export type RefreshPhase =
  | 'idle'
  /** Asked for, not started yet: Paolo still has to tap Run workflow, or GitHub has not picked it up. */
  | 'queued'
  /** The job is running: reading the official schedules. */
  | 'running'
  /** The job finished, the new file was downloaded, validated and saved, and something changed. */
  | 'success'
  /** Same as success, except nothing on the schools' pages had changed. */
  | 'unchanged'
  /** Saved, but some schools could not be read. */
  | 'partial'
  /** The job failed, or the file would not validate. Saved data is untouched. */
  | 'failed'
  /** Nothing arrived inside the watch window. The run may still be going. */
  | 'timeout';

export interface RefreshState {
  phase: RefreshPhase;
  /** When this attempt began. */
  startedAt: string | null;
  /** When this attempt reached a final phase. */
  endedAt: string | null;
  /** The run GitHub is actually executing, when it can be seen. */
  runUrl: string | null;
  runId: number | null;
  /** Results that were not in the feed before this refresh. */
  added: number;
  /** Fixtures that were not in the feed before, or whose date or time moved. */
  fixturesChanged: number;
  okCount: number;
  total: number;
  failed: string[];
  error: string | null;
  /** `builtAt` of the feed when the attempt began, so "changed" means changed since then. */
  baselineBuiltAt: string | null;
}

const IDLE: RefreshState = {
  phase: 'idle',
  startedAt: null,
  endedAt: null,
  runUrl: null,
  runId: null,
  added: 0,
  fixturesChanged: 0,
  okCount: 0,
  total: 0,
  failed: [],
  error: null,
  baselineBuiltAt: null,
};

interface WaterPoloState {
  feed: PoloFeed | null;
  /** The last time the app asked for the published file, successfully or not. */
  lastFetchAt: string | null;
  /** The last time a check actually completed and the saved data was up to date. */
  lastSuccessAt: string | null;
  lastError: string | null;
  refreshing: boolean;
  ready: boolean;
  refresh: RefreshState;
}

const REFRESH_MIN_MS = 10 * 60_000;
const base = () => import.meta.env.BASE_URL;

/** How long the app keeps watching for a build, and how often it looks. */
const WATCH_EVERY_MS = 30_000;
const WATCH_FOR_MS = 12 * 60_000;

// The feed is re-downloadable, so it lives in `kv` alongside editions and lesson packs rather than
// in its own object store, and it is deliberately left out of the backup file.
export const waterPoloStore = createStore<WaterPoloState>(
  { feed: null, lastFetchAt: null, lastSuccessAt: null, lastError: null, refreshing: false, ready: false, refresh: IDLE },
  async () => ({
    feed: await kvGet<PoloFeed | null>('waterpolo:feed', null),
    lastFetchAt: await kvGet<string | null>('waterpolo:lastFetchAt', null),
    lastSuccessAt: await kvGet<string | null>('waterpolo:lastSuccessAt', null),
    lastError: null,
    refreshing: false,
    ready: true,
    refresh: await kvGet<RefreshState>('waterpolo:refresh', IDLE),
  }),
);

const patch = (p: Partial<WaterPoloState>) => waterPoloStore.set({ ...waterPoloStore.get(), ...p });

/** Persist the refresh state as well as showing it, so leaving the screen does not lose it. */
async function setRefresh(next: Partial<RefreshState>) {
  const refresh = { ...waterPoloStore.get().refresh, ...next };
  patch({ refresh });
  await kvSet('waterpolo:refresh', refresh);
}

/**
 * Download the published file, bypassing every cache.
 *
 * A refresh that showed a stale copy would be worse than no refresh at all, so the watcher asks
 * for a unique URL with `no-store`. The service worker leaves these alone (see `vite.config.ts`),
 * which keeps them out of the runtime cache.
 */
async function downloadFeed(bustCache = false): Promise<PoloFeed | null> {
  const url = bustCache ? `${base()}data/waterpolo.json?t=${Date.now()}` : `${base()}data/waterpolo.json`;
  try {
    const r = await fetch(url, { cache: bustCache ? 'no-store' : 'no-cache', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const data: unknown = await r.json();
    return validFeed(data) ? data : null;
  } catch {
    return null;
  }
}

interface RunInfo {
  id: number;
  url: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: string | null;
  createdAt: string;
}

/** The newest run GitHub reports, or null when the API cannot be read. */
async function latestRun(): Promise<RunInfo[] | null> {
  try {
    const r = await fetch(RUNS_API, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null; // rate limited or offline: fall back to watching the file
    const body = (await r.json()) as { workflow_runs?: { id: number; html_url: string; status: string; conclusion: string | null; created_at: string }[] };
    return (body.workflow_runs ?? []).map((x) => ({ id: x.id, url: x.html_url, status: x.status, conclusion: x.conclusion, createdAt: x.created_at }));
  } catch {
    return null;
  }
}

/** What changed between the feed we had and the one that just arrived. */
function diff(before: PoloFeed | null, after: PoloFeed) {
  const had = new Map((before?.games ?? []).map((g) => [g.id, g]));
  let added = 0;
  let fixturesChanged = 0;
  for (const g of after.games) {
    const prior = had.get(g.id);
    if (isFinal(g) && (!prior || !isFinal(prior))) added++;
    else if (isUpcoming(g) && (!prior || prior.date !== g.date || prior.time !== g.time)) fixturesChanged++;
  }
  return { added, fixturesChanged };
}

/** Save a downloaded feed and report what it means. Success is only ever claimed from here. */
async function adopt(next: PoloFeed): Promise<RefreshState> {
  const before = waterPoloStore.get().feed;
  const { added, fixturesChanged } = diff(before, next);
  await kvSet('waterpolo:feed', next);
  const at = new Date().toISOString();
  await kvSet('waterpolo:lastFetchAt', at);
  await kvSet('waterpolo:lastSuccessAt', at);
  patch({ feed: next, lastFetchAt: at, lastSuccessAt: at, lastError: null });

  const failed = next.sources.filter((s) => !s.ok);
  const okCount = next.sources.length - failed.length;
  // "All thirteen schools" is only ever said when all thirteen were actually read.
  const phase: RefreshPhase = failed.length > 0 ? 'partial' : added + fixturesChanged > 0 ? 'success' : 'unchanged';
  return {
    ...waterPoloStore.get().refresh,
    phase,
    endedAt: at,
    added,
    fixturesChanged,
    okCount,
    total: next.sources.length,
    failed: failed.map((s) => s.display),
    error: null,
  };
}

/** One watcher at a time, and it survives leaving the screen because its state is on disk. */
let watching: number | null = null;

async function tick(baselineRunId: number | null, deadline: number): Promise<void> {
  const state = waterPoloStore.get().refresh;
  const runs = await latestRun();

  if (runs) {
    const mine = runs.find((r) => baselineRunId === null || r.id > baselineRunId) ?? null;
    if (mine) {
      if (mine.status === 'queued') {
        await setRefresh({ phase: 'queued', runId: mine.id, runUrl: mine.url });
      } else if (mine.status === 'in_progress') {
        await setRefresh({ phase: 'running', runId: mine.id, runUrl: mine.url });
      } else if (mine.status === 'completed' && mine.conclusion && mine.conclusion !== 'success') {
        stop();
        await setRefresh({
          phase: 'failed',
          runId: mine.id,
          runUrl: mine.url,
          endedAt: new Date().toISOString(),
          error: `The run on GitHub ${mine.conclusion === 'cancelled' ? 'was cancelled' : `finished as ${mine.conclusion}`}. Your saved results are untouched.`,
        });
        return;
      }
    }
  }

  // The published file is the only thing that decides success: the job can report success and still
  // have committed nothing, and a job that has not finished has not updated anything.
  const next = await downloadFeed(true);
  if (next && next.builtAt !== state.baselineBuiltAt) {
    stop();
    await setRefresh(await adopt(next));
    return;
  }

  // The run finished successfully but the file did not move: it found nothing to commit.
  const done = runs?.find((r) => (baselineRunId === null || r.id > baselineRunId) && r.status === 'completed' && r.conclusion === 'success');
  if (done && next) {
    stop();
    const at = new Date().toISOString();
    await kvSet('waterpolo:lastFetchAt', at);
    await kvSet('waterpolo:lastSuccessAt', at);
    const failed = next.sources.filter((s) => !s.ok);
    patch({ lastFetchAt: at, lastSuccessAt: at });
    await setRefresh({
      phase: failed.length > 0 ? 'partial' : 'unchanged',
      endedAt: at,
      added: 0,
      fixturesChanged: 0,
      okCount: next.sources.length - failed.length,
      total: next.sources.length,
      failed: failed.map((s) => s.display),
      runUrl: done.url,
      runId: done.id,
      error: null,
    });
    return;
  }

  if (Date.now() >= deadline) {
    stop();
    await setRefresh({ phase: 'timeout', endedAt: new Date().toISOString() });
  }
}

function stop() {
  if (watching !== null) {
    clearInterval(watching);
    watching = null;
  }
}

function startWatching(baselineRunId: number | null, startedAtMs: number) {
  stop();
  const deadline = startedAtMs + WATCH_FOR_MS;
  watching = window.setInterval(() => void tick(baselineRunId, deadline), WATCH_EVERY_MS);
  void tick(baselineRunId, deadline);
}

export const waterPoloRefresh = {
  /**
   * Open the workflow page and start watching for the build it produces.
   *
   * Nothing here reaches a school or the CWPA, and no credential is involved: the app reads its own
   * published results file and GitHub's public run status, and nothing else.
   */
  async checkNow(): Promise<void> {
    await waterPoloStore.ensure();
    window.open(RUN_URL, '_blank', 'noopener,noreferrer');
    if (watching !== null) return; // already watching; the tap just re-opened the page

    const startedAt = new Date();
    const runs = await latestRun();
    const baselineRunId = runs?.length ? runs[0].id : null;
    await setRefresh({
      ...IDLE,
      phase: 'queued',
      startedAt: startedAt.toISOString(),
      baselineBuiltAt: waterPoloStore.get().feed?.builtAt ?? null,
      total: waterPoloStore.get().feed?.sources.length ?? 0,
    });
    startWatching(baselineRunId, startedAt.getTime());
  },

  /**
   * Pick a watch back up after leaving the screen or closing the app.
   *
   * The state is on disk, so the answer is the real one: still watching if the window has not run
   * out, timed out if it has. A finished result is left exactly as it was.
   */
  async resume(): Promise<void> {
    await waterPoloStore.ensure();
    const r = waterPoloStore.get().refresh;
    if (r.phase !== 'queued' && r.phase !== 'running') return;
    if (watching !== null) return;
    const started = r.startedAt ? Date.parse(r.startedAt) : 0;
    if (!started || Date.now() - started > WATCH_FOR_MS) {
      await setRefresh({ phase: 'timeout', endedAt: new Date().toISOString() });
      return;
    }
    startWatching(r.runId ? r.runId - 1 : null, started);
  },

  /** Try again after a failure, without re-opening the page if a run is already going. */
  async retry(): Promise<void> {
    stop();
    await setRefresh({ ...IDLE });
    await waterPoloRefresh.checkNow();
  },

  /** Dismiss the banner. Stops the watch if it is still running. */
  async dismiss(): Promise<void> {
    stop();
    await setRefresh({ ...IDLE });
  },
};

export const waterPoloActions = {
  /**
   * Download the published results file. This never touches a school's website: the schools are
   * read by the scheduled workflow, and the app only reads what that workflow published.
   * `manual` applies the same ten-minute throttle the edition uses.
   */
  async refresh(manual = false): Promise<void> {
    await waterPoloStore.ensure(); // never patch on top of a state that is still loading
    const s = waterPoloStore.get();
    if (s.refreshing) return;
    if (manual && s.lastFetchAt && Date.now() - new Date(s.lastFetchAt).getTime() < REFRESH_MIN_MS) {
      patch({ lastError: 'Checked less than 10 minutes ago. Use “Refresh scores & fixtures” to read the schools now.' });
      return;
    }
    patch({ refreshing: true, lastError: null });
    try {
      const data = await downloadFeed(manual);
      if (!data) throw new Error('Results file could not be read');
      const current = waterPoloStore.get().feed;
      if (!current || current.builtAt !== data.builtAt) {
        await kvSet('waterpolo:feed', data);
        patch({ feed: data });
      }
      const at = new Date().toISOString();
      await kvSet('waterpolo:lastFetchAt', at);
      await kvSet('waterpolo:lastSuccessAt', at);
      patch({ lastFetchAt: at, lastSuccessAt: at, lastError: null });
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
