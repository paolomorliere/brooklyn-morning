import { useEffect, useState } from 'preact/hooks';

/** Minimal observable store: load once from IndexedDB, mutate through actions, re-render subscribers. */
export function createStore<T>(initial: T, load: () => Promise<T>) {
  let state = initial;
  let loaded: Promise<void> | null = null;
  const subs = new Set<(s: T) => void>();
  const set = (next: T) => {
    state = next;
    subs.forEach((f) => f(state));
  };
  const reload = async () => set(await load());
  const ensure = () => (loaded ??= reload());
  return {
    get: () => state,
    set,
    reload,
    ensure,
    use(): T {
      const [s, setS] = useState(state);
      useEffect(() => {
        subs.add(setS);
        void ensure();
        setS(state);
        return () => {
          subs.delete(setS);
        };
      }, []);
      return s;
    },
  };
}

/** Run `fn` now, when the app becomes visible again, and on an interval. Used for 12-h task reconciliation. */
export function onResume(fn: () => void, intervalMs = 5 * 60_000): () => void {
  const vis = () => document.visibilityState === 'visible' && fn();
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('focus', fn);
  window.addEventListener('pageshow', fn);
  const id = window.setInterval(fn, intervalMs);
  fn();
  return () => {
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('focus', fn);
    window.removeEventListener('pageshow', fn);
    clearInterval(id);
  };
}
