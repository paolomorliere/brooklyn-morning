import { test, expect, type Locator, type Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 15_000 });
};

/**
 * The reported bug, measured rather than eyeballed.
 *
 * Two things have to hold for a header to sit over its numbers: the header cell and the body cell
 * have to occupy the same column box, and they have to align their text the same way. The second is
 * what was broken — `.polo-table th { text-align: left }` outranks `.polo-num { text-align: right }`
 * on specificity — and it is invisible to any test that only counts cells.
 */
async function expectColumnsAligned(table: Locator) {
  const heads = table.locator('thead th.polo-num');
  const n = await heads.count();
  expect(n).toBeGreaterThan(0);

  const rows = table.locator('tbody tr');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  for (let i = 0; i < n; i++) {
    const th = heads.nth(i);
    expect(await th.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
    const head = await th.boundingBox();
    for (let r = 0; r < rowCount; r++) {
      const td = rows.nth(r).locator('td.polo-num').nth(i);
      expect(await td.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
      const cell = await td.boundingBox();
      // Same column: same left and right edge, to the pixel.
      expect(Math.abs((cell?.x ?? 0) - (head?.x ?? 0))).toBeLessThan(1);
      expect(Math.abs((cell?.width ?? 0) - (head?.width ?? 0))).toBeLessThan(1);
    }
  }

  // The position column is the one that aligns left, in the header as well as the body.
  const pos = table.locator('thead th.polo-pos');
  if (await pos.count()) {
    expect(await pos.evaluate((el) => getComputedStyle(el).textAlign)).toBe('left');
    const head = await pos.boundingBox();
    const cell = await rows.first().locator('td.polo-pos').boundingBox();
    expect(Math.abs((cell?.x ?? 0) - (head?.x ?? 0))).toBeLessThan(1);
    expect(Math.abs((cell?.width ?? 0) - (head?.width ?? 0))).toBeLessThan(1);
  }
}

test('the conference table’s headers sit over their own numbers', async ({ page }) => {
  await open(page);
  for (const conference of ['MAWPC', 'NWPC']) {
    await page.getByRole('button', { name: conference, exact: true }).click();
    const table = page.locator('.polo-standings .polo-table');
    await expect(table).toBeVisible();
    await expectColumnsAligned(table);
    // Every row has all seven cells, including a row whose own page could not be read: a cell
    // spanning the four numeric columns used to shift the whole table's widths.
    const rows = table.locator('tbody tr');
    for (let r = 0; r < (await rows.count()); r++) {
      await expect(rows.nth(r).locator('td')).toHaveCount(7);
    }
  }
});

test('the table does not overflow its screen and long names wrap', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();
  const table = page.locator('.polo-standings .polo-table');
  const box = await table.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box?.width ?? 0).toBeLessThanOrEqual(width);
  // No horizontal scrolling anywhere on the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('the poll table’s headers sit over their own numbers', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/poll');
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await expectColumnsAligned(page.locator('.polo-poll-table'));
});

test('upcoming fixtures appear only in the unfiltered view', async ({ page }) => {
  await open(page);
  const weekend = page.locator('.polo-weekend');
  await expect(weekend).toBeVisible();

  const expectHidden = async () => {
    // The whole section goes: heading, count, range line and empty state together.
    await expect(weekend).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'This weekend' })).toHaveCount(0);
    await expect(page.locator('.polo-weekend-empty')).toHaveCount(0);
    await expect(page.locator('.polo-weekend-range')).toHaveCount(0);
  };

  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();
  await expectHidden();

  await page.getByRole('button', { name: 'All games', exact: true }).click();
  await expect(weekend).toBeVisible();

  await page.getByRole('group', { name: 'Team' }).getByRole('button', { name: 'LIU', exact: true }).click();
  await expectHidden();

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(weekend).toBeVisible();

  // A day filter hides it too, and so does a day filter combined with a conference.
  await page.locator('.polo-dates-chips .chip').nth(1).click();
  await expectHidden();
  await page.getByRole('button', { name: 'NWPC', exact: true }).click();
  await expectHidden();

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(weekend).toBeVisible();
});

test('a team screen still has its own schedule', async ({ page }) => {
  await open(page);
  await page.getByRole('group', { name: 'Team' }).getByRole('button', { name: 'LIU', exact: true }).click();
  const row = page.locator('.polo-row').first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await row.locator('.polo-score').click({ force: true });
  await page.goBack();
  // The main screen's fixtures stay hidden under the restored filter, and the team page's own
  // Schedule view is a different thing entirely.
  await expect(page.locator('.polo-weekend')).toHaveCount(0);
});

test('the conference table says when the CWPA schedule was read', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();
  await expect(page.locator('.polo-standings')).toContainText('MAWPC schedule read');
});

test('an unread conference schedule is stated, not hidden', async ({ page }) => {
  await page.route('**/data/waterpolo.json*', async (route) => {
    const feed = await (await route.fetch()).json();
    feed.conference.sources = feed.conference.sources.map((s: { id: string }) =>
      s.id === 'MAWPC' ? { ...s, ok: false, error: 'HTTP 503' } : s,
    );
    await route.fulfill({ json: feed });
  });
  await open(page);
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();
  await expect(page.locator('.polo-standings')).toContainText('could not be read');
  await expect(page.locator('.polo-standings')).toContainText('not yet in this table');
  // The conference that was read says so as usual.
  await page.getByRole('button', { name: 'NWPC', exact: true }).click();
  await expect(page.locator('.polo-standings')).toContainText('NWPC schedule read');
});
