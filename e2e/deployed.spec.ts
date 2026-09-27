/**
 * Checks the app that is actually deployed, not the one in this working tree.
 *
 * Kept out of the normal run because it talks to GitHub Pages: `npm run e2e:deployed` after a
 * deploy. Every assertion here is about a problem that was reported against the live app.
 */
import { test, expect } from '@playwright/test';

const SITE = 'https://paolomorliere.github.io/brooklyn-morning/';

test('the deployed app shows one Concordia row and this weekend', async ({ page }) => {
  await page.goto(`${SITE}#/waterpolo`);
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 40_000 });

  // The reported duplicate: one row, one identity, counted once.
  await page.getByRole('button', { name: 'Sep 26' }).click();
  const rows = page.locator('.polo-row', { hasText: 'Concordia' }).filter({ hasText: 'Harvard' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Concordia Irvine');
  await expect(rows).toContainText('19');
  await expect(rows).toContainText('18');

  await page.getByRole('button', { name: 'All results' }).click();
  await expect(page.getByRole('heading', { name: 'This weekend' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh scores and fixtures/ })).toBeVisible();
  await expect(page.locator('.polo-last')).toBeVisible();
});

test('the deployed app offers the Sunday quiz and a readable Library', async ({ page }) => {
  // Paolo's profile: the sequence started on the epoch Monday. A brand-new profile would correctly
  // have no week 1 to be quizzed on yet.
  await page.goto(`${SITE}#/home`);
  await page.waitForFunction(() => document.querySelector('.app') !== null, null, { timeout: 40_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const open = indexedDB.open('brooklyn-personal');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ key: 'lessonProgress', value: { startMonday: '2026-09-21', readLessonIds: [] } });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  // A full load, not a hash change: the stores read the profile once, at boot.
  await page.goto(`${SITE}?r=1#/quiz/2026-09-21`);
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.locator('.screen').getByText('1 / 20')).toBeVisible();

  await page.goto(`${SITE}#/week/2026-09-21`);
  await expect(page.getByRole('heading', { name: /This week.s lessons/ })).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('section.lesson')).toHaveCount(7);
  await expect(page.locator('section.lesson').first()).toContainText('Explanation');
});

test('the deployed team page switches between Results and Schedule', async ({ page }) => {
  await page.goto(`${SITE}#/team/liu`);
  await expect(page.locator('.polo-team-name')).toHaveText('LIU', { timeout: 40_000 });
  await expect(page.locator('.polo-record b')).toHaveText(/^\d+–\d+/);
  await page.getByRole('button', { name: /^Schedule/ }).click();
  await expect(page.locator('.polo-row--fixture').first()).toBeVisible();
  await expect(page.locator('.polo-row--fixture').first().locator('.polo-when')).toBeVisible();
});

test('the deployed poll shows the published week', async ({ page }) => {
  await page.goto(`${SITE}#/poll`);
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.polo-poll-title')).toContainText('Week 4');
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(25);
  await expect(page.locator('.polo-poll-table tbody .polo-crest--initials')).toHaveCount(0);
});
