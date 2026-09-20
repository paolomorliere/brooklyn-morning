// Dev-only: seed the personal database with preview data. Runs only on localhost with ?fixtures=1.
// `seed=none` leaves the database empty (used by e2e tests that build their own state).
import { personalDB } from '@/db/personal';
import { previewTasks } from './preview';

export async function seedFixtures(mode: string): Promise<void> {
  if (mode === 'none') return;
  const db = await personalDB();
  const tx = db.transaction('tasks', 'readwrite');
  if ((await tx.store.count()) === 0) {
    for (const t of previewTasks) tx.store.put({ ...t, order: Number(t.id) });
  }
  await tx.done;
}
