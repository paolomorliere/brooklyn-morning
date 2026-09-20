import { test, expect, type Page } from '@playwright/test';

const fresh = async (page: Page, path = '/?fixtures=1&seed=none#/groceries') => {
  await page.goto(path);
};
const search = (page: Page) => page.getByRole('textbox', { name: 'Search products' });
const waitCatalog = async (page: Page) => {
  await expect(search(page)).toHaveAttribute('placeholder', /Search Trader Joe/, { timeout: 20_000 });
};

test('list → check-off → Buy again / Discover; sections stay visible and separated', async ({ page }) => {
  await fresh(page);
  await expect(page.getByText('Search a product above')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Buy again' })).toHaveCount(0);
  await waitCatalog(page);

  await search(page).fill('sourdough');
  const row = page.locator('li.result-row').first();
  const name = (await row.locator('.result-name').textContent())!.trim();
  await row.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await expect(row.getByLabel('Quantity 1')).toBeVisible();
  await row.getByRole('button', { name: `Increase ${name}` }).click();
  await expect(row.getByLabel('Quantity 2')).toBeVisible();
  // Remove straight from the search results.
  await row.getByRole('button', { name: `Decrease ${name}` }).click();
  await row.getByRole('button', { name: `Decrease ${name}` }).click();
  await expect(row.getByRole('button', { name: `Add ${name}`, exact: true })).toBeVisible();
  await row.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Clear search' }).click();

  await expect(page.locator('.gitem .result-name', { hasText: name })).toBeVisible();
  await page.getByRole('checkbox', { name: `Got ${name}` }).click();
  await expect(page.getByText('List is clear')).toBeVisible();
  const headings = await page.locator('.section-title h2').allInnerTexts();
  expect(headings.indexOf('Discover') === -1 || headings.indexOf('Discover') < headings.indexOf('Buy again')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Buy again' })).toBeVisible();
  const card = page.locator('.buyagain .card-wrap', { hasText: name });
  await expect(card).toBeVisible();
  expect(await page.locator('.discover').count()).toBeLessThanOrEqual(3);
  await expect(page.locator('.discover').filter({ hasText: name })).toHaveCount(0);

  // + on the Buy again card puts it back; the card then disappears from Buy again (it is on the list).
  await card.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await expect(page.locator('.gitem .result-name', { hasText: name })).toBeVisible();
  await expect(page.locator('.buyagain .card-wrap', { hasText: name })).toHaveCount(0);
});

test('product detail opens from a search result and can add from there', async ({ page }) => {
  await fresh(page);
  await waitCatalog(page);
  await search(page).fill('unexpected cheddar');
  const row = page.locator('li.result-row').first();
  const name = (await row.locator('.result-name').textContent())!.trim();
  await row.getByRole('button', { name: `Details for ${name}` }).click();
  await expect(page).toHaveURL(/#\/product\//);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name.slice(0, 12), 'i') })).toBeVisible();
  await expect(page.getByText(/Rough estimate for the|Reported by a shopper/)).toBeVisible();
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.getByLabel('Quantity 1')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.gitem .result-name', { hasText: name })).toBeVisible();
});

test('a single item can be removed from Buy again history', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Add other item' }).click();
  await page.getByLabel('Item name').fill('Bananas');
  await page.getByRole('button', { name: 'Add to list' }).click();
  await page.getByRole('checkbox', { name: 'Got Bananas' }).click();
  const card = page.locator('.buyagain .card-wrap', { hasText: 'Bananas' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Options for Bananas' }).click();
  await page.getByRole('button', { name: /Delete its history/ }).click();
  await expect(page.locator('.buyagain .card-wrap', { hasText: 'Bananas' })).toHaveCount(0);
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
  const row = page.locator('li.result-row').first();
  await expect(row).toBeVisible();
  await expect(row.locator('.thumb svg').first()).toBeVisible({ timeout: 10_000 });
  await expect(row.locator('.thumb img')).toHaveCount(0);
});

test('works offline after first load (list persisted, catalog cached)', async ({ page, context }) => {
  await fresh(page);
  await waitCatalog(page);
  await search(page).fill('cheddar');
  await page.locator('li.result-row').first().locator('.add-btn').click();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await context.setOffline(true);
  await page.reload().catch(() => {});
  // Dev server has no service worker, so a hard reload offline can fail; the point of this check is the
  // IndexedDB state, which we verify via a soft navigation instead.
  await context.setOffline(false);
  await page.goto('/?fixtures=1&seed=none#/groceries');
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/todo'; location.hash = '#/groceries'; });
  await expect(page.locator('.gitem').getByLabel('Quantity 1')).toBeVisible();
  await search(page).fill('cheddar');
  await expect(page.locator('li.result-row').first()).toBeVisible();
  await context.setOffline(false);
});

test('favorites: star fills, item appears in Favorites, tap adds to list, unstar removes', async ({ page }) => {
  await fresh(page);
  await waitCatalog(page);
  await search(page).fill('sourdough');
  const row = page.locator('li.result-row').first();
  const name = (await row.locator('.result-name').textContent())!.trim();
  const star = row.getByRole('button', { name: `Add ${name} to Favorites` });
  await star.click();
  await expect(row.getByRole('button', { name: `Remove ${name} from Favorites` })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear search' }).click();
  const favs = page.locator('section', { has: page.getByRole('heading', { name: 'Favorites' }) });
  await expect(favs.locator('.name', { hasText: name })).toBeVisible();
  await favs.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await expect(page.locator('.gitem .result-name', { hasText: name })).toBeVisible();
  await expect(page.locator('.gitem').getByRole('button', { name: `Remove ${name} from Favorites` })).toBeVisible(); // star also lit on the list row
  await page.reload();
  await expect(favs.locator('.name', { hasText: name })).toBeVisible(); // persisted
  await favs.getByRole('button', { name: `Remove ${name} from Favorites` }).click();
  await expect(favs).toHaveCount(0);
});
