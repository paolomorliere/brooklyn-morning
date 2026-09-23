import { test, expect, type Page } from '@playwright/test';

const openPoll = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/poll');
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 15_000 });
};

test('reached from the results screen and back again', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'CWPA Top 20' }).click();
  await expect(page.getByRole('heading', { name: 'CWPA Top 20' })).toBeVisible();
  // A secondary screen: Back, no tab bar.
  await expect(page.locator('.tabbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.polo-row').first()).toBeVisible();
});

test('shows every published row, with the week and the date it was published', async ({ page }) => {
  await openPoll(page);
  await expect(page.locator('.polo-poll-title')).toContainText('Top 20 · Week 3');
  await expect(page.locator('.polo-poll-sub')).toContainText('September 16, 2026');

  const rows = page.locator('.polo-poll-table tbody tr');
  await expect(rows).toHaveCount(22); // 20 ranked, including two ties, plus two receiving votes

  const ranks = await rows.locator('.polo-pos').allInnerTexts();
  expect(ranks.slice(0, 5)).toEqual(['1', '2', '3', '4', '5']);
  expect(ranks.filter((r) => r === '6 (T)')).toHaveLength(2);
  expect(ranks.filter((r) => r === '11 (T)')).toHaveLength(2);
  expect(ranks.filter((r) => r === 'RV')).toHaveLength(2);
});

test('the points are the CWPA’s, not a calculation', async ({ page }) => {
  await openPoll(page);
  const points = (await page.locator('.polo-poll-table tbody .polo-pts').allInnerTexts()).map(Number);
  expect(points).toEqual([97, 96, 90, 85, 84, 72, 72, 64, 61, 52, 50, 50, 41, 34, 27, 24, 20, 15, 12, 5, 3, 1]);
  // Tied teams carry identical points, which is the only reason they are tied.
  expect(points[5]).toBe(points[6]);
  await expect(page.locator('.polo-table-note')).toContainText('copied from the CWPA');
});

test('keeps the previous week’s column exactly as published', async ({ page }) => {
  await openPoll(page);
  await expect(page.locator('.polo-poll-table thead')).toContainText('Week 2');
  const brown = page.locator('.polo-poll-table tbody tr', { hasText: 'Brown' });
  await expect(brown.locator('.polo-prev')).toHaveText('18 (T)');
  const navy = page.locator('.polo-poll-table tbody tr', { hasText: 'Navy' });
  await expect(navy.locator('.polo-prev')).toHaveText('RV');
});

test('every row has a crest, and a broken image falls back to initials', async ({ page }) => {
  await openPoll(page);
  await expect(page.locator('.polo-poll-table tbody .polo-crest')).toHaveCount(22);
  await expect(page.locator('.polo-poll-table tbody .polo-crest--initials')).toHaveCount(0);

  await page.route('**/logos/*.webp', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.polo-poll-table tbody .polo-crest--initials')).toHaveCount(22);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('says when it is waiting for this week’s poll, and still shows the real one', async ({ page }) => {
  await page.route('**/data/poll.json', async (route) => {
    const poll = await (await route.fetch()).json();
    await route.fulfill({ json: { ...poll, awaiting: true } });
  });
  await openPoll(page);
  await expect(page.locator('.polo-partial')).toContainText('Awaiting this week’s poll');
  await expect(page.locator('.polo-partial')).toContainText('Week 3');
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(22);
});

test('a published poll is never replaced by an older week', async ({ page }) => {
  await openPoll(page);
  await expect(page.locator('.polo-poll-title')).toContainText('Week 3');
  // Serve an older poll, as a stale job would.
  await page.route('**/data/poll.json', async (route) => {
    const poll = await (await route.fetch()).json();
    await route.fulfill({ json: { ...poll, week: 1, builtAt: '2000-01-01T00:00:00.000Z', rows: poll.rows.slice(0, 3) } });
  });
  await page.getByRole('button', { name: 'Check for a new poll' }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('.polo-poll-title')).toContainText('Week 3');
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(22);
});

test('a malformed poll file is refused and the saved one kept', async ({ page }) => {
  await openPoll(page);
  await page.route('**/data/poll.json', (route) => route.fulfill({ json: { schemaVersion: 1, rows: [] } }));
  await page.getByRole('button', { name: 'Check for a new poll' }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(22);
});

test('keeps working offline from the saved copy', async ({ page, context }) => {
  await openPoll(page);
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/waterpolo'; });
  await page.evaluate(() => { location.hash = '#/poll'; });
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(22);
  await context.setOffline(false);
});

test('nothing on this screen reaches collegiatewaterpolo.org', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) external.push(r.url());
  });
  await openPoll(page);
  await page.getByRole('button', { name: 'Check for a new poll' }).click();
  await page.waitForTimeout(600);
  expect(external).toEqual([]);
});
