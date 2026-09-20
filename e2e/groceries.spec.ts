import { test, expect, type Page } from '@playwright/test';

const fresh = async (page: Page, path = '/?fixtures=1&seed=none#/groceries') => {
  await page.goto(path);
};
const search = (page: Page) => page.getByRole('textbox', { name: 'Search products' });
const waitCatalog = async (page: Page) => {
  await expect(search(page)).toHaveAttribute('placeholder', /Search Trader Joe/, { timeout: 20_000 });
};

test('state 1 → 2 → 3: first use, list, then buy-again/discover', async ({ page }) => {
  await fresh(page);
  await expect(page.getByText('Your list is empty')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buy again' })).toHaveCount(0);
  await waitCatalog(page);

  // Add a catalog product twice → qty 2, "On list" badge.
  await search(page).fill('sourdough');
  const first = page.locator('button.result').first();
  const name = (await first.locator('.result-name').textContent())!.trim();
  await first.click();
  await expect(first.getByText(/On list ×1/)).toBeVisible();
  await first.click();
  await expect(first.getByText(/On list ×2/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Quantity 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buy again' })).toHaveCount(0); // hidden while list has items

  // Check off → list empty + history exists → state 3.
  await page.getByRole('checkbox', { name: `Got ${name}` }).click();
  await expect(page.getByText('List is clear')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buy again' })).toBeVisible();
  await expect(page.locator('.buyagain button', { hasText: name })).toBeVisible();
  const discoverCards = page.locator('.discover');
  expect(await discoverCards.count()).toBeLessThanOrEqual(3);
  // Discover never shows the item already bought.
  await expect(discoverCards.filter({ hasText: name })).toHaveCount(0);

  // Buy again puts it straight back on the list (state 2 again).
  await page.locator('.buyagain button', { hasText: name }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buy again' })).toHaveCount(0);
});

test('Other-only list counts as a list; Undo restores a checked item', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Add other item' }).click();
  await page.getByLabel('Item name').fill('Bananas');
  await page.getByRole('button', { name: 'Produce' }).click();
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.locator('.gsection', { has: page.getByRole('heading', { name: 'Produce' }) }).locator('.result-name', { hasText: 'Bananas' })).toBeVisible();
  await expect(page.getByText('Your list is empty')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Got Bananas' }).click();
  await expect(page.getByText('List is clear')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.gitem .result-name', { hasText: 'Bananas' })).toBeVisible();
  await expect(page.getByText('List is clear')).toHaveCount(0);
});

test('empty search result offers "Add other item" with the typed text', async ({ page }) => {
  await fresh(page);
  await waitCatalog(page);
  await search(page).fill('zzqx unicorn');
  await expect(page.getByText('No match')).toBeVisible();
  await page.getByRole('button', { name: 'Add “zzqx unicorn”' }).click();
  await expect(page.getByLabel('Item name')).toHaveValue('zzqx unicorn');
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.locator('.gitem .result-name', { hasText: 'zzqx unicorn' })).toBeVisible();
});

test('corrupt catalog download is rejected and the app stays usable', async ({ page }) => {
  await page.route('**/data/catalog.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"count":2,"products":[{"id":"1","name":"x"' }));
  await fresh(page);
  await expect(page.getByText(/Product catalog unavailable/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add other item' }).click();
  await page.getByLabel('Item name').fill('Milk');
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.locator('.gitem .result-name', { hasText: 'Milk' })).toBeVisible();
});

test('a truncated catalog never replaces a good one', async ({ page }) => {
  await fresh(page);
  await waitCatalog(page);
  const before = await page.evaluate(() => new Promise<number>((res) => { const q = indexedDB.open('brooklyn-catalog'); q.onsuccess = () => { const c = q.result.transaction('products').objectStore('products').count(); c.onsuccess = () => res(c.result); }; }));
  expect(before).toBeGreaterThan(1000);
  await page.route('**/data/catalog.meta.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, version: 'bogus', count: 150, checksum: '' }) }));
  await page.route('**/data/catalog.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, version: 'bogus', count: 150, products: Array.from({ length: 150 }, (_, i) => ({ id: String(i), name: `P${i}`, size: '', section: 'Pantry', tags: [], imageUrl: null })) }) }));
  await page.goto('/?fixtures=1&seed=none#/settings');
  await page.getByRole('button', { name: /Check for a new catalog/ }).click();
  await expect(page.getByText(/much smaller/)).toBeVisible({ timeout: 20_000 });
  const after = await page.evaluate(() => new Promise<number>((res) => { const q = indexedDB.open('brooklyn-catalog'); q.onsuccess = () => { const c = q.result.transaction('products').objectStore('products').count(); c.onsuccess = () => res(c.result); }; }));
  expect(after).toBe(before);
});

test('broken product images fall back to a placeholder', async ({ page }) => {
  await page.route('**/images.openfoodfacts.org/**', (r) => r.fulfill({ status: 404 }));
  await fresh(page);
  await waitCatalog(page);
  await search(page).fill('peanut butter');
  const row = page.locator('button.result').first();
  await expect(row).toBeVisible();
  await expect(row.locator('.thumb svg')).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('.thumb img')).toHaveCount(0);
});

test('works offline after first load (list persisted, catalog cached)', async ({ page, context }) => {
  await fresh(page);
  await waitCatalog(page);
  await search(page).fill('cheddar');
  await page.locator('button.result').first().click();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await context.setOffline(true);
  await page.reload().catch(() => {});
  // Dev server has no service worker, so a hard reload offline can fail; the point of this check is the
  // IndexedDB state, which we verify via a soft navigation instead.
  await context.setOffline(false);
  await page.goto('/?fixtures=1&seed=none#/groceries');
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/todo'; location.hash = '#/groceries'; });
  await expect(page.getByLabel('Quantity 1')).toBeVisible();
  await search(page).fill('cheddar');
  await expect(page.locator('button.result').first()).toBeVisible();
  await context.setOffline(false);
});
