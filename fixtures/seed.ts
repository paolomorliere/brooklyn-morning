// Dev-only: seed the personal database with preview data. Runs only on localhost with ?fixtures=1.
// `seed=none` leaves the database empty (used by e2e tests that build their own state).
import { kvSet, personalDB } from '@/db/personal';
import { previewLibrary, previewTasks } from './preview';

/**
 * Dev-only: put values straight into `kv` before the app's stores read it.
 *
 * End-to-end tests need a profile that has been in use for a while — a lesson sequence that
 * started weeks ago, an archived edition, a stale lesson pack. Writing that from the test's own
 * IndexedDB connection races the app's first writes, so the test leaves the values in
 * sessionStorage and they are applied here, through the app's own connection, before anything
 * reads. Runs only on localhost with `?fixtures=1`, like the rest of this file.
 */
async function seedKvFromSession(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem('fixtures:kv');
  } catch {
    return;
  }
  if (!raw) return;
  const values = JSON.parse(raw) as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) await kvSet(key, value);
  // Applied once. A reload must not put the starting profile back over whatever the test has done
  // since — that is how a saved quiz draft would vanish on a refresh.
  try {
    sessionStorage.removeItem('fixtures:kv');
    sessionStorage.setItem('fixtures:kv:done', '1');
  } catch {
    /* ignore */
  }
}

export async function seedFixtures(mode: string): Promise<void> {
  await seedKvFromSession();
  if (mode === 'none') return;
  const db = await personalDB();
  const tx = db.transaction(['tasks', 'library'], 'readwrite');
  if ((await tx.objectStore('tasks').count()) === 0) {
    for (const t of previewTasks) tx.objectStore('tasks').put({ ...t, order: Number(t.id) });
  }
  if ((await tx.objectStore('library').count()) === 0) {
    for (const e of previewLibrary) tx.objectStore('library').put(e);
  }
  await tx.done;
}
