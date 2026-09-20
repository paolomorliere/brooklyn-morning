// Dev-only: seed the personal database with preview data. Runs only on localhost with ?fixtures=1.
// `seed=none` leaves the database empty (used by e2e tests that build their own state).
import { personalDB } from '@/db/personal';
import { previewLibrary, previewTasks } from './preview';

export async function seedFixtures(mode: string): Promise<void> {
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
