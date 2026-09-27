import { expect, type Page } from '@playwright/test';

/**
 * Put the personal database into a known state before the app boots.
 *
 * The values are handed to the app's own dev-fixtures path (`?fixtures=1`, localhost only), which
 * writes them through the app's connection before any store reads. Writing from the test's own
 * IndexedDB connection instead raced the app's first writes and could hang behind them.
 */
export async function seedKv(page: Page, url: string, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript((vals) => {
    try {
      // Only on the first load. The script runs again on every navigation, and re-seeding would
      // undo whatever the test has done since.
      if (!sessionStorage.getItem('fixtures:kv:done')) sessionStorage.setItem('fixtures:kv', JSON.stringify(vals));
    } catch {
      /* storage disabled: the test will simply see a default profile */
    }
  }, values);
  await page.goto(url);
}

/** A profile whose lesson sequence started on the epoch Monday, like Paolo's. */
export const STARTED_WEEK_1 = { lessonProgress: { startMonday: '2026-09-21', readLessonIds: [] } };

/** Wait for a screen that renders lessons to have finished its first pack sync. */
export async function lessonsReady(page: Page): Promise<void> {
  await expect(page.locator('section.lesson').first()).toBeVisible({ timeout: 20_000 });
}
