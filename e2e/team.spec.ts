import { test, expect, type Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 15_000 });
};

test('a tap on a team name opens that team and never the game sheet', async ({ page }) => {
  await open(page);
  const row = page.locator('.polo-row').first();
  const name = await row.locator('.polo-name').first().innerText();
  await row.locator('.polo-name').first().click();

  await expect(page).toHaveURL(/#\/team\//);
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.polo-team-name')).toHaveText(name);
  // A team screen is not one of the five tabs.
  await expect(page.locator('.tabbar')).toHaveCount(0);
});

test('a tap anywhere else on the row opens the game sheet, unchanged', async ({ page }) => {
  await open(page);
  const row = page.locator('.polo-row').first();
  await row.locator('.polo-score').click({ force: true });
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.polo-sheet-score')).toBeVisible();
  await expect(page.locator('.polo-sources li').first()).toBeVisible();
  await expect(page).not.toHaveURL(/#\/team\//);
});

test('both names work, including an opponent that is not on the watchlist', async ({ page }) => {
  await open(page);
  // Mercyhurst is a real 2026 opponent and is deliberately not on the watchlist.
  const row = page.locator('.polo-row', { hasText: 'Mercyhurst' }).first();
  await row.locator('.polo-name', { hasText: 'Mercyhurst' }).click();
  await expect(page).toHaveURL(/#\/team\/mercyhurst/);
  await expect(page.locator('.polo-team-name')).toHaveText('Mercyhurst');
  await expect(page.locator('.polo-row').first()).toBeVisible();
});

test('the team screen shows a record, a roster link and the whole season', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/team/wagner');
  await expect(page.locator('.polo-team-name')).toHaveText('Wagner', { timeout: 15_000 });
  await expect(page.locator('.polo-record b')).toHaveText(/^\d+–\d+(–\d+)?$/);
  const roster = page.getByRole('link', { name: /Roster/ });
  await expect(roster).toHaveAttribute('href', /wagnerathletics\.com\/sports\/.+\/roster\/2026/);
  await expect(page.getByRole('link', { name: 'Official schedule' })).toHaveAttribute('href', /schedule\/2026/);

  // Its whole season, newest day first, and more games than any single day holds.
  const headings = await page.locator('.section-title h2').allInnerTexts();
  expect(headings.length).toBeGreaterThan(3);
  const parsed = headings.map((h) => Date.parse(`${h.replace(/^\w+, /, '')}, 2026`));
  expect(parsed).toEqual([...parsed].sort((a, b) => b - a));

  // The record matches the rows on the screen.
  const record = await page.locator('.polo-record b').innerText();
  const [w, l] = record.split('–').map(Number);
  const games = await page.locator('.polo-row').count();
  expect(w + l).toBeLessThanOrEqual(games);
  expect(w + l).toBeGreaterThan(0);
});

test('an opponent whose own page could not be read says so', async ({ page }) => {
  // UCLA's schedule is rendered in the browser, so there is nothing to read at build time.
  await page.goto('/?fixtures=1&seed=none#/team/ucla');
  await expect(page.locator('.polo-team-name')).toHaveText('UCLA', { timeout: 15_000 });
  await expect(page.locator('.polo-partial')).toContainText('results collected so far');
  await expect(page.locator('.polo-row').first()).toBeVisible();
});

test('back from a team screen restores the filters and the scroll position', async ({ page }) => {
  await open(page);
  const teamChips = page.getByRole('group', { name: 'Team' });
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();
  await teamChips.getByRole('button', { name: 'Bucknell', exact: true }).click();
  await expect(page.locator('.polo-active')).toContainText('MAWPC');

  await page.evaluate(() => scrollTo({ top: 400 }));
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => Math.round(scrollY));
  expect(before).toBeGreaterThan(100);

  await page.locator('.polo-row .polo-name').first().click();
  await expect(page).toHaveURL(/#\/team\//);
  await page.goBack();

  await expect(page.locator('.polo-active')).toContainText('MAWPC');
  await expect(page.getByRole('button', { name: 'MAWPC', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(teamChips.getByRole('button', { name: 'Bucknell', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 }).toBeGreaterThan(100);
});

test('a team screen starts at the top, not where the last screen was scrolled to', async ({ page }) => {
  await open(page);
  await page.evaluate(() => scrollTo({ top: 900 }));
  await page.waitForTimeout(150);
  await page.locator('.polo-row').last().locator('.polo-name').first().click();
  await expect(page).toHaveURL(/#\/team\//);
  await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 }).toBeLessThan(40);
});

test('a team with no 2026 game in the feed says so instead of looking broken', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/team/not-a-real-team');
  await expect(page.getByRole('heading', { name: /Not in this season/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Back to results' }).click();
  await expect(page.locator('.polo-row').first()).toBeVisible();
});

test('nothing on a team screen reaches a school’s website', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) external.push(r.url());
  });
  await page.goto('/?fixtures=1&seed=none#/team/liu');
  await expect(page.locator('.polo-team-name')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
});
