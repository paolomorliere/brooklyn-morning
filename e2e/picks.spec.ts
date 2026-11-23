import { test, expect, type Page } from '@playwright/test';

/**
 * The track record of the stock picks. Its data is routed, so these tests never depend on how the real
 * picks happen to be doing on the day they run.
 *
 * Four finished picks: two beat the S&P 500 and two trailed it, and one of the two that beat it lost
 * money doing so (a falling market). One of them, CCC, has a card that could not be followed as written:
 * it was published after its own buy day's open. One open pick doing very well, which must not move any
 * finished figure. One pick bought today with no close yet. One that could not be priced. And version 1,
 * which must never be added in.
 *
 * On $1,000 each, the finished four make +120, −20, −100 and −40: down $40 in all.
 */
const row = (o: Record<string, unknown>) => ({ strategyVersion: 2, horizon: 21, reason: null, grossPct: null, excessRspPct: null, ...o });
const exact = (buy: string, sell: string) => ({ cardBuy: buy, cardSell: sell, entryDate: buy, valueDate: sell, publishedAt: `${buy}T10:00:00.000Z` });
const RECAPS = [
  {
    kind: 'recap', strategyVersion: 2, asOf: '2026-11-20', completed: 4, open: 1,
    meanNetPct: 0, meanExcessSpyPct: 0, meanExcessRspPct: null, winRate: 0.25, mixedHorizonMeanPct: null, horizonsSpanned: [21],
    note: 'test',
    rows: [
      row({ date: '2026-10-01', ticker: 'AAA', name: 'Alpha Corp', status: 'complete', sessionsHeld: 21, ...exact('2026-10-01', '2026-10-29'), entryPrice: 10, valuePrice: 11.2, netPct: 12, excessSpyPct: 10, spyPct: 2 }),
      row({ date: '2026-10-02', ticker: 'BBB', name: 'Beta Inc.', status: 'complete', sessionsHeld: 21, ...exact('2026-10-02', '2026-10-30'), entryPrice: 50, valuePrice: 49, netPct: -2, excessSpyPct: 4, spyPct: -6 }),
      // Published at 6 PM New York on its own buy day: measured from the next open instead.
      row({ date: '2026-10-05', ticker: 'CCC', name: 'Gamma plc', status: 'complete', sessionsHeld: 21, cardBuy: '2026-10-05', cardSell: '2026-11-02', publishedAt: '2026-10-05T22:00:00.000Z', entryDate: '2026-10-06', valueDate: '2026-11-03', entryPrice: 20, valuePrice: 18, netPct: -10, excessSpyPct: -6, spyPct: -4 }),
      row({ date: '2026-10-07', ticker: 'DDD', name: 'Delta Ltd', status: 'complete', sessionsHeld: 21, ...exact('2026-10-07', '2026-11-04'), entryPrice: 30, valuePrice: 29, netPct: -4, excessSpyPct: -2, spyPct: -2 }),
      row({ date: '2026-10-08', ticker: 'MISS', name: 'Missing Co', status: 'unpriced', sessionsHeld: 0, netPct: null, excessSpyPct: null }),
      row({ date: '2026-11-10', ticker: 'RUN', name: 'Runner Inc.', status: 'open', sessionsHeld: 9, cardBuy: '2026-11-10', cardSell: '2026-12-08', publishedAt: '2026-11-10T10:00:00.000Z', entryDate: '2026-11-10', valueDate: '2026-11-20', entryPrice: 5, valuePrice: 7.5, netPct: 50, excessSpyPct: 58, spyPct: -8 }),
      row({ date: '2026-11-23', ticker: 'NEW', name: 'New Co', status: 'not-entered', sessionsHeld: 0, cardBuy: '2026-11-23', cardSell: '2026-12-21', publishedAt: '2026-11-23T09:00:00.000Z', netPct: null, excessSpyPct: null }),
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

const openRecord = async (page: Page) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/picks');
  await expect(page.locator('.tr-money')).toBeVisible({ timeout: 20_000 });
};

const finishedRow = (page: Page, ticker: string) => page.locator('section[aria-labelledby="tr-finished"] .tr-bar-row', { hasText: ticker });

test('one tap from the Morning card opens the track record, which leads with money', async ({ page }) => {
  await routeStock(page);
  await page.goto('/?fixtures=1&seed=none#/home');
  const entry = page.locator('section.stock .stock-record');
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText('$1,000 in each finished pick: down $40');
  await expect(entry).toContainText('2 still open');
  await entry.click();
  await expect(page).toHaveURL(/#\/picks$/);
  await expect(page.getByRole('heading', { name: 'If you’d done what the cards said'.replace('’', "'") })).toBeVisible();
});

test('the money answer: finished and open, kept apart', async ({ page }) => {
  await openRecord(page);
  const money = page.locator('.tr-money');
  await expect(money).toContainText('$1,000 into each pick, bought and sold on the card');
  const blocks = money.locator('.tr-money-block');
  await expect(blocks.nth(0)).toContainText('Finished · sold on the card');
  await expect(blocks.nth(0).locator('.tr-money-v')).toHaveText('Down $40 (−1.0%)');
  await expect(blocks.nth(0)).toContainText('4 picks · $4,000 in, $3,960 back · made money on 1, lost on 3');
  // The open pick's +$500 is its own figure and never added to the finished one.
  await expect(blocks.nth(1)).toContainText('at the close on Fri, Nov 20');
  await expect(blocks.nth(1).locator('.tr-money-v')).toHaveText('Up $500 (+50.0%) so far');
  await expect(blocks.nth(0).locator('.tr-money-v')).toHaveClass(/is-loss/);
  await expect(blocks.nth(1).locator('.tr-money-v')).toHaveClass(/is-gain/);
  await expect(blocks.nth(1)).toContainText('1 pick · $1,000 in, worth $1,500 now · up on 1, down on 0');
  await expect(blocks.nth(1)).toContainText('NEW: bought at the open on Mon, Nov 23, no closing price for it yet');
  await expect(money).toContainText('kept apart');
});

test('every finished pick says what its card said and what $1,000 made or lost', async ({ page }) => {
  await openRecord(page);
  const rows = page.locator('section[aria-labelledby="tr-finished"] .tr-bar-row');
  await expect(rows).toHaveCount(4);
  // Newest first, money on the bars by default.
  await expect(rows.nth(0)).toContainText('DDD');
  await expect(rows.nth(3).locator('.tr-value')).toHaveText('+$120');
  await expect(rows.nth(3).locator('.tr-bar-up')).toHaveCount(1);
  await expect(rows.nth(2).locator('.tr-value')).toHaveText('−$20');
  await expect(rows.nth(2).locator('.tr-bar-down')).toHaveCount(1);

  const bbb = finishedRow(page, 'BBB');
  await bbb.locator('button').click();
  const d = bbb.locator('.tr-detail');
  await expect(d).toContainText('The card said: buy at the open Fri, Oct 2 · sell at the close Fri, Oct 30');
  await expect(d).toContainText('Bought Fri, Oct 2 at $50.00 · sold Fri, Oct 30 at $49.00');
  await expect(d.locator('.tr-answer')).toHaveText('On $1,000: lost $20 (−2.0%)');
  // Lost money, beat the market: both said, neither hidden.
  await expect(d).toContainText('The S&P 500 over the same days: −6.0% · ahead by 4.0 points');
});

test('a card that could not be followed as written says so, and says what was measured instead', async ({ page }) => {
  await openRecord(page);
  const ccc = finishedRow(page, 'CCC');
  await ccc.locator('button').click();
  const d = ccc.locator('.tr-detail');
  await expect(d).toContainText('The card said: buy at the open Mon, Oct 5 · sell at the close Mon, Nov 2');
  await expect(d.locator('.tr-note')).toContainText("It was published at 6:00 PM on Mon, Oct 5, after that day's open, so it couldn't be bought as written");
  await expect(d.locator('.tr-note')).toContainText('Measured from the next open instead, Tue, Oct 6, to the close Tue, Nov 3');
  await expect(d.locator('.tr-answer')).toHaveText('On $1,000: lost $100 (−10.0%)');
});

test('an open pick is valued at the last close, with the card’s sell day and the days left', async ({ page }) => {
  await openRecord(page);
  const running = page.locator('section[aria-labelledby="tr-running"]');
  await expect(running).toContainText('not reached the sell day on their card');
  const r = running.locator('.tr-bar-row', { hasText: 'RUN' });
  await expect(r).toHaveClass(/is-provisional/);
  await expect(r).toContainText('day 9/21');
  await expect(r.locator('.tr-value')).toHaveText('+$500');
  await r.locator('button').click();
  const d = r.locator('.tr-detail');
  await expect(d).toContainText('The card says: buy at the open Tue, Nov 10 · sell at the close Tue, Dec 8');
  await expect(d).toContainText('Bought Tue, Nov 10 at $5.00 · last close Fri, Nov 20 at $7.50');
  await expect(d.locator('.tr-answer')).toContainText('On $1,000: up $500 so far (+50.0%), with 12 trading days to go');

  const fresh = running.locator('.tr-bar-row', { hasText: 'NEW' });
  await expect(fresh.locator('.tr-value')).toHaveText('—');
  await fresh.locator('button').click();
  await expect(fresh.locator('.tr-detail')).toContainText('No closing price has been published for it yet');

  await expect(page.locator('.tr-unpriced')).toContainText('MISS (Oct 8)');
});

test('the switch puts the S&P 500 comparison on the bars instead', async ({ page }) => {
  await openRecord(page);
  await page.getByRole('button', { name: 'vs S&P 500' }).click();
  await expect(page.getByRole('button', { name: 'vs S&P 500' })).toHaveAttribute('aria-pressed', 'true');
  await expect(finishedRow(page, 'AAA').locator('.tr-value')).toHaveText('+10.0');
  // BBB lost money but beat the market: its bar changes side.
  await expect(finishedRow(page, 'BBB').locator('.tr-bar-up')).toHaveCount(1);
  await expect(page.locator('section[aria-labelledby="tr-finished"] .tr-axis')).toContainText('S&P 500');
  // The comparison panel is unchanged by the switch: (10 + 4 − 6 − 2) / 4 = +1.5 points.
  await expect(page.locator('.tr-headline .tr-verdict')).toContainText('1.5 points above the S&P 500');
  await expect(page.locator('.tr-hero-v')).toHaveText(/2\s*of 4/);
});

test('version 1 is kept apart, says its cards gave no sell day, and never moves the figures', async ({ page }) => {
  await openRecord(page);
  await expect(page.locator('.tr-money')).not.toContainText('99');
  await page.getByRole('button', { name: 'The earlier version' }).click();
  const v1 = page.locator('.tr-v1');
  await expect(v1).toContainText('never said when to sell');
  await expect(v1).toContainText('$1,000 in each, held five days: up $990');
  await expect(page.locator('.tr-money-block').first().locator('.tr-money-v')).toHaveText('Down $40 (−1.0%)');
});

test('the track record fits the screen and works offline from the saved copy', async ({ page, context }) => {
  await openRecord(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await context.setOffline(true);
  // Leave and come back, then ask for a newer record: the saved one stays, and the failure is said.
  await page.evaluate(() => { location.hash = '#/todo'; });
  await page.evaluate(() => { location.hash = '#/picks'; });
  await page.getByRole('button', { name: 'Check for a newer record' }).click();
  await expect(page.getByRole('status')).toContainText(/offline|Couldn/);
  await expect(page.locator('.tr-money-block').first().locator('.tr-money-v')).toHaveText('Down $40 (−1.0%)');
  await context.setOffline(false);
});
