import { test, expect, type Page } from '@playwright/test';

/**
 * The track record of the stock picks. Its data is routed, so these tests never depend on how the real
 * picks happen to be doing on the day they run.
 *
 * Four finished picks: two beat the S&P 500 and two trailed it, and one of the two that beat it lost
 * money doing so (a falling market). One running pick that is doing very well, which must not move any
 * figure. One pick that could not be priced. And version 1, which must never be added in.
 */
const row = (o: Record<string, unknown>) => ({ strategyVersion: 2, horizon: 21, reason: null, grossPct: null, excessRspPct: null, ...o });
const RECAPS = [
  {
    kind: 'recap', strategyVersion: 2, asOf: '2026-11-20', completed: 4, open: 1,
    meanNetPct: 0, meanExcessSpyPct: 0, meanExcessRspPct: null, winRate: 0.25, mixedHorizonMeanPct: null, horizonsSpanned: [21],
    note: 'test',
    rows: [
      row({ date: '2026-10-01', ticker: 'AAA', name: 'Alpha Corp', status: 'complete', sessionsHeld: 21, entryDate: '2026-10-01', entryPrice: 10, valueDate: '2026-10-29', valuePrice: 11.2, netPct: 12, excessSpyPct: 10, spyPct: 2 }),
      row({ date: '2026-10-02', ticker: 'BBB', name: 'Beta Inc.', status: 'complete', sessionsHeld: 21, entryDate: '2026-10-02', entryPrice: 50, valueDate: '2026-10-30', valuePrice: 49, netPct: -2, excessSpyPct: 4, spyPct: -6 }),
      row({ date: '2026-10-05', ticker: 'CCC', name: 'Gamma plc', status: 'complete', sessionsHeld: 21, entryDate: '2026-10-05', entryPrice: 20, valueDate: '2026-11-02', valuePrice: 18, netPct: -10, excessSpyPct: -6, spyPct: -4 }),
      row({ date: '2026-10-06', ticker: 'DDD', name: 'Delta Ltd', status: 'complete', sessionsHeld: 21, entryDate: '2026-10-06', entryPrice: 30, valueDate: '2026-11-03', valuePrice: 29, netPct: -4, excessSpyPct: -2, spyPct: -2 }),
      row({ date: '2026-10-07', ticker: 'MISS', name: 'Missing Co', status: 'unpriced', sessionsHeld: 0, netPct: null, excessSpyPct: null }),
      row({ date: '2026-11-10', ticker: 'RUN', name: 'Runner Inc.', status: 'open', sessionsHeld: 9, entryDate: '2026-11-10', entryPrice: 5, valueDate: '2026-11-20', valuePrice: 7.5, netPct: 50, excessSpyPct: 58, spyPct: -8 }),
    ],
  },
  {
    kind: 'recap', strategyVersion: 1, asOf: '2026-11-20', completed: 1, open: 0,
    meanNetPct: 99, meanExcessSpyPct: 99, meanExcessRspPct: null, winRate: 1, mixedHorizonMeanPct: 99, horizonsSpanned: [5],
    note: 'v1',
    rows: [{ strategyVersion: 1, date: '2026-09-21', ticker: 'OLD', name: 'Old Pick', status: 'complete', sessionsHeld: 5, horizon: 5, netPct: 99, excessSpyPct: 99 }],
  },
];

const routeStock = async (page: Page) => {
  await page.route('**/data/stock.json*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.builtAt = '2026-11-23T09:52:00.000Z';
    body.recaps = RECAPS;
    await route.fulfill({ json: body });
  });
};

test('one tap from the Morning card opens the track record', async ({ page }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/home');
  const entry = page.locator('section.stock .stock-record');
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText('2 of 4 finished picks beat the S&P 500');
  await expect(entry).toContainText('1 still running');
  await entry.click();
  await expect(page).toHaveURL(/#\/picks$/);
  await expect(page.getByRole('heading', { name: 'Track record' })).toBeVisible();
});

test('the answer comes first, from finished picks only', async ({ page }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/picks');
  const head = page.locator('.tr-headline');
  await expect(head).toBeVisible({ timeout: 20_000 });
  // (10 + 4 − 6 − 2) / 4 = +1.5 points. The running pick's +58 is nowhere in it.
  await expect(head.locator('.tr-verdict')).toContainText('ahead of the market');
  await expect(head.locator('.tr-verdict')).toContainText('1.5 points above the S&P 500');
  await expect(head.locator('.tr-hero-v')).toHaveText(/2\s*of 4/);
  // Average pick (12 − 2 − 10 − 4)/4 = −1.0%, S&P (2 − 6 − 4 − 2)/4 = −2.5%.
  await expect(head.locator('.tr-tile').nth(0)).toContainText('−1.0%');
  await expect(head.locator('.tr-tile').nth(1)).toContainText('−2.5%');
  // Beat the market and made money are different questions.
  await expect(head.locator('.tr-tile').nth(2)).toContainText('1 of 4');
  await expect(head).toContainText('small sample');
  await expect(page.locator('.screen')).toContainText('prices as of the close on Nov 20');
});

test('every finished pick has a bar on the correct side, newest first, and its prices on tap', async ({ page }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/picks');
  const finished = page.locator('section[aria-labelledby="tr-finished"] .tr-bar-row');
  await expect(finished).toHaveCount(4, { timeout: 20_000 });
  await expect(finished.nth(0)).toContainText('DDD');
  await expect(finished.nth(3)).toContainText('AAA');
  await expect(finished.nth(3).locator('.tr-bar-up')).toHaveCount(1);
  await expect(finished.nth(0).locator('.tr-bar-down')).toHaveCount(1);
  await expect(finished.nth(3).locator('.tr-value')).toHaveText('+10.0');

  await finished.nth(2).locator('button').click();
  const detail = finished.nth(2).locator('.tr-detail');
  await expect(detail).toContainText('Beta Inc.');
  await expect(detail).toContainText('bought Oct 2 at $50.00');
  await expect(detail).toContainText('sold Oct 30 at $49.00');
  await expect(detail).toContainText('The stock −2.0% · the S&P 500 −6.0% · ahead by 4.0 points');
});

test('a running pick is drawn apart, labelled so far, and the unpriced one is named', async ({ page }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/picks');
  const running = page.locator('section[aria-labelledby="tr-running"]');
  await expect(running).toBeVisible({ timeout: 20_000 });
  await expect(running).toContainText('not counted above');
  const r = running.locator('.tr-bar-row');
  await expect(r).toHaveCount(1);
  await expect(r).toHaveClass(/is-provisional/);
  await expect(r).toContainText('day 9/21');
  await r.locator('button').click();
  await expect(r.locator('.tr-detail')).toContainText('So far the stock +50.0%');
  await expect(r.locator('.tr-detail')).toContainText('12 trading days to go');
  await expect(page.locator('.tr-unpriced')).toContainText('MISS (Oct 7)');
});

test('version 1 is kept apart and never moves the figures', async ({ page }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/picks');
  await expect(page.locator('.tr-headline')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.tr-headline')).not.toContainText('99');
  await page.getByRole('button', { name: 'The earlier version' }).click();
  const v1 = page.locator('.tr-v1');
  await expect(v1).toContainText('kept separate');
  await expect(v1).toContainText('1 of 1 beat the S&P 500');
  await expect(page.locator('.tr-hero-v')).toHaveText(/2\s*of 4/);
});

test('the track record fits the screen and works offline from the saved copy', async ({ page, context }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/picks');
  await expect(page.locator('.tr-headline')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await context.setOffline(true);
  // Leave and come back, then ask for a newer record: the saved one stays, and the failure is said.
  await page.evaluate(() => { location.hash = '#/todo'; });
  await page.evaluate(() => { location.hash = '#/picks'; });
  await page.getByRole('button', { name: 'Check for a newer record' }).click();
  await expect(page.getByRole('status')).toContainText(/offline|Couldn/);
  await expect(page.locator('.tr-hero-v')).toHaveText(/2\s*of 4/);
  await context.setOffline(false);
});
