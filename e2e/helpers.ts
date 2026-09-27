import { expect, type Page } from '@playwright/test';

/**
 * Put the personal database into a known state, then reload so the app boots from it.
 *
 * The app owns the database schema, so this lets it create the stores first and only then writes
 * into `kv` — where lesson progress, lesson packs and archived editions live. Creating the
 * database from the test instead would leave it at the right version with the wrong stores.
 */
export async function seedKv(page: Page, url: string, values: Record<string, unknown>): Promise<void> {
  await page.goto(url);
  // Wait until the stores have finished their own first write. The lesson store creates a progress
  // record on first run, and seeding before that lands would be overwritten a moment later.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const r = indexedDB.open('brooklyn-personal');
        r.onerror = () => resolve(false);
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('kv')) { db.close(); return resolve(false); }
          const g = db.transaction('kv').objectStore('kv').get('lessonProgress');
          g.onsuccess = () => { db.close(); resolve(!!g.result); };
          g.onerror = () => { db.close(); resolve(false); };
        };
      }),
    null,
    { timeout: 20_000 },
  );
  const write = async () =>
    page.evaluate(async (vals) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('brooklyn-personal');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('kv', 'readwrite');
          for (const [key, value] of Object.entries(vals as Record<string, unknown>)) {
            tx.objectStore('kv').put({ key, value });
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
      return new Promise<string>((resolve) => {
        const open = indexedDB.open('brooklyn-personal');
        open.onsuccess = () => {
          const db = open.result;
          const g = db.transaction('kv').objectStore('kv').get('lessonProgress');
          g.onsuccess = () => { db.close(); resolve(JSON.stringify(g.result?.value ?? null)); };
        };
      });
    }, values);

  await write();
  await page.reload();
  // The app writes a fresh lesson-progress record on a first run, and that write can land after the
  // seed. Writing again after the reload settles it, so the profile is the one the test asked for.
  if ('lessonProgress' in values) {
    await page.waitForTimeout(250);
    await write();
    await page.reload();
  }
}

/** A profile whose lesson sequence started on the epoch Monday, like Paolo's. */
export const STARTED_WEEK_1 = { lessonProgress: { startMonday: '2026-09-21', readLessonIds: [] } };

/** Wait for a screen that renders lessons to have finished its first pack sync. */
export async function lessonsReady(page: Page): Promise<void> {
  await expect(page.locator('section.lesson').first()).toBeVisible({ timeout: 20_000 });
}
