import { test, expect, type Page } from '@playwright/test';
import { seedKv } from './helpers';

/**
 * A version 2 card with every part the plan requires it to carry: the horizon, evidence with the
 * period each figure covers and the day it was filed, the signals that produced the score, the signals
 * that do not apply, peers, the strongest counterargument, the conditions that would invalidate it, and
 * the sources.
 */
const PICK = {
  kind: 'pick',
  strategyVersion: 2,
  strategyHash: 'abc123def4567890',
  date: '2026-10-06',
  publishedAt: '2026-10-06T10:00:00.000Z',
  decisionSession: '2026-10-02',
  ticker: 'ADI',
  name: 'Analog Devices, Inc.',
  cik: '0000006281',
  sic: '3674',
  sector: 'Manufacturing',
  industry: '36',
  referenceClose: 417.15,
  referenceCloseDate: '2026-10-02',
  horizonSessions: 21,
  plannedEntry: '2026-10-06',
  plannedExit: '2026-11-04',
  thesis:
    "Ranked first among today's eligible candidates on revenue growth, trailing year, growth acceleration, operating margin trend — revenue +33.6% over the trailing year, growth accelerating against the previous quarter, earnings fully backed by cash.",
  rankScore: 97,
  composite: 1.42,
  scoredAgainst: '2048 operating candidates',
  scanned: 5051,
  eligible: 612,
  signals: [
    { key: 'revenueGrowth', label: 'Revenue growth, trailing year', value: 0.336, z: 1.9, cohort: 2048 },
    { key: 'cashConversion', label: 'Cash conversion', value: 1.34, z: 0.42, cohort: 1811 },
    { key: 'earningsYield', label: 'Earnings yield', value: 0.02, z: -0.61, cohort: 1702 },
  ],
  signalsDropped: [{ key: 'grossProfitability', why: 'gross profit or total assets is not reported' }],
  evidence: [
    { label: 'Revenue, trailing year', value: '$13,882M, +33.6%', period: '4 qtrs to 2026-08-01', filed: '2026-08-19', tag: 'RevenueFromContractWithCustomerExcludingAssessedTax' },
    { label: 'Gross margin, trailing year', value: '65.8%, from 60.2%', period: '4 qtrs to 2026-08-01', filed: '2026-08-19', tag: 'GrossProfit' },
    { label: 'Earnings yield / free cash flow yield', value: '2.0% / 2.4%', period: 'trailing year against the reference close', filed: null, interpretation: true },
  ],
  peers: [
    { ticker: 'ADI', name: 'Analog Devices, Inc.', revenueTtm: 13_882_000_000, revenueGrowth: 0.336, quarterYoY: 0.396, grossMargin: 0.658, operatingMargin: 0.355, cashConversion: 1.34, freeCashFlowTtm: 4_937_000_000 },
    { ticker: 'TXN', name: 'Texas Instruments', revenueTtm: 19_453_000_000, revenueGrowth: 0.167, quarterYoY: 0.21, grossMargin: 0.588, operatingMargin: 0.377, cashConversion: 0.74, freeCashFlowTtm: 517_000_000 },
  ],
  peerBasis: '38 candidates in SIC major group 36, compared on free cash flow yield, all from the same source and the same periods.',
  runnersUp: [{ ticker: 'MPWR', name: 'Monolithic Power', rankScore: 95, why: 'its weakest signal was earnings yield (-0.88)' }],
  counterargument:
    'It is an expensive stock: 48.9× trailing earnings and a 2.4% free cash flow yield, so the growth is already in the price and one weak quarter would cost a lot.',
  invalidation: [
    'Quarterly revenue growth falling below +37.2%, the rate it was running at the quarter before.',
    'A close below the 200-session average, which stood at $362.40 on the decision date.',
  ],
  risks: ['The share count is from 2026-08-01, 62 days older than the price, so the market capitalisation carries that staleness.'],
  earnings: {
    estimate: '2026-11-24',
    basis: "the same fiscal quarter's announcement a year earlier (2025-11-25) plus 364 days",
    spreadDays: 6,
    confirmed: false,
    inWindow: false,
    nearWindow: false,
  },
  rule: 'Universe: every US-listed common stock on NYSE, Nasdaq or NYSE American. The score is a ranking position among that day\'s eligible candidates. It is not a probability, a price target, or a forecast of any return.',
  validation: 'The held-out window has not been opened. No claim of an edge is made or implied.',
  sources: {
    universe: 'Nasdaq Trader nasdaqtraded.txt',
    fundamentals: 'SEC Financial Statement Data Sets, point-in-time by accepted timestamp',
    prices: 'Massive (Polygon.io) grouped daily bars, splits and dividends',
  },
};

const NO_PICK = {
  kind: 'unavailable',
  strategyVersion: 2,
  reason:
    'No candidate qualified today. The test that removed the most was trend: the close is below its 200-session average — 1,904 of 2,663 screened.',
  rule: PICK.rule,
  lastPublishedFor: '2026-10-05',
};

/** Version 1's card, as it was published: no `strategyVersion` field at all. */
const V1_PICK = {
  kind: 'pick',
  date: '2026-09-30',
  ticker: 'ADI',
  name: 'Analog Devices',
  lastClose: 417.15,
  asOf: '2026-10-02',
  r5: 0.0598,
  r20: 0.1701,
  volRatio: 0.8,
  pctOfHigh60: 1,
  mentions: 0,
  rule: 'Universe: S&P 100. Keep stocks above their 20-day average with a positive 5-day return.',
  scanned: 104,
};

const openWith = async (page: Page, stock: unknown) => {
  await page.route('**/data/edition.json', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.stock = stock;
    await route.fulfill({ json: body });
  });
  await page.goto('/?fixtures=1&seed=none#/home');
  await expect(page.locator('section.stock')).toBeVisible({ timeout: 20_000 });
};

test('the brief states the horizon, the score and what the score is not', async ({ page }) => {
  await openWith(page, PICK);
  const card = page.locator('section.stock');
  await expect(card.getByRole('heading', { name: /Analog Devices/ })).toBeVisible();
  await expect(card.locator('.stock-head .price')).toHaveText('$417.15');
  await expect(card.locator('.stock-horizon')).toContainText('21-session horizon');
  await expect(card.locator('.stock-horizon')).toContainText('Oct 6');
  await expect(card.locator('.stock-horizon')).toContainText('Nov 4');
  await expect(card.locator('.stock-score-v')).toContainText('97');
  // The one sentence that must never be missing from a number like this.
  await expect(card.locator('.stock-score-k')).toContainText('not a 97% chance of profit');
  await expect(card.locator('.stock-score-k')).toContainText('612');
  await expect(card.locator('.stock-score-k')).toContainText('5,051');
});

test('the counterargument and the invalidation conditions are not hidden behind the expander', async ({ page }) => {
  await openWith(page, PICK);
  const card = page.locator('section.stock');
  await expect(card.getByRole('heading', { name: 'The strongest counterargument' })).toBeVisible();
  await expect(card).toContainText('48.9× trailing earnings');
  await expect(card.getByRole('heading', { name: 'What would show this was wrong' })).toBeVisible();
  await expect(card).toContainText('A close below the 200-session average');
  await expect(card.getByRole('heading', { name: 'Timing and risk' })).toBeVisible();
  // An estimate is always labelled an estimate, with its spread and its basis.
  await expect(card).toContainText('estimated Nov 24');
  await expect(card).toContainText('give or take about 6 days');
  await expect(card).toContainText('no free source publishes one');
  await expect(card).toContainText('outside the holding window');
  await expect(card.locator('.stock-validation')).toContainText('not been opened');
});

test('the evidence carries its periods, filing dates, tags and sources', async ({ page }) => {
  await openWith(page, PICK);
  const card = page.locator('section.stock');
  await card.getByRole('button', { name: 'The evidence' }).click();
  const detail = card.locator('.stock-detail');
  await expect(detail).toBeVisible();

  const first = detail.locator('.stock-table').first().locator('tbody tr').first();
  await expect(first).toContainText('$13,882M, +33.6%');
  await expect(first).toContainText('4 qtrs to 2026-08-01');
  await expect(first).toContainText('2026-08-19');
  await expect(first.locator('.stock-tag')).toContainText('RevenueFromContractWithCustomerExcludingAssessedTax');

  // A figure that involves a market price is an interpretation, and is marked as one.
  await expect(detail.locator('tr.stock-interpretation')).toContainText('Earnings yield');

  await expect(detail.getByRole('heading', { name: 'What produced the score' })).toBeVisible();
  await expect(detail.locator('.stock-signals li')).toHaveCount(3);
  await expect(detail.locator('.stock-signals li').first()).toContainText('+1.90');
  await expect(detail.locator('.stock-signals li').last()).toContainText('-0.61');

  await expect(detail.getByRole('heading', { name: 'Signals that do not apply to this company' })).toBeVisible();
  await expect(detail).toContainText('gross profit or total assets is not reported');
  await expect(detail).toContainText('None of them was scored as zero');

  await expect(detail.getByRole('heading', { name: 'Peers' })).toBeVisible();
  await expect(detail.locator('tr.stock-self')).toContainText('ADI');
  await expect(detail.getByRole('heading', { name: 'Why this one and not the runners-up' })).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(detail).toContainText('Nasdaq Trader');
  await expect(detail).toContainText('Massive');
});

test('no qualifying pick says which test bound, and does not repeat the last pick', async ({ page }) => {
  await openWith(page, NO_PICK);
  const card = page.locator('section.stock');
  await expect(card.getByRole('heading', { name: 'No qualifying pick today' })).toBeVisible();
  await expect(card).toContainText('the close is below its 200-session average');
  await expect(card).toContainText('1,904 of 2,663 screened');
  await expect(card).toContainText('a pick belongs to the session it was made in');
  // And nothing that looks like a recommendation is on screen.
  await expect(card.locator('.stock-score')).toHaveCount(0);
  await expect(card.locator('.stock-head')).toHaveCount(0);
});

test('an archived edition shows the card it was published with', async ({ page }) => {
  // Hiding the card on archived editions was a small dishonesty: the published record of what the rule
  // picked on a given day is the thing most worth being able to look back at.
  await page.route('**/data/edition.json', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.stock = PICK;
    await route.fulfill({ json: body });
  });
  // A date the published edition does not already occupy: a refresh writes the live edition to
  // `edition:<its own date>`, which would overwrite a seed sharing that date.
  await seedKv(page, '/?fixtures=1&seed=none#/home', {
    'edition:dates': ['2026-09-30'],
    'edition:2026-09-30': {
      date: '2026-09-30',
      preparedAt: '2026-09-30T09:52:00.000Z',
      stories: [],
      sources: [],
      stock: V1_PICK,
    },
  });
  await expect(page.locator('section.stock')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Past editions' }).click();
  await page.getByRole('button', { name: /September 30/ }).click();

  const card = page.locator('section.stock');
  await expect(card).toBeVisible();
  // Version 1's own card, with its own figures and an honest note about what it was.
  await expect(card.locator('.stock-metrics')).toBeVisible();
  await expect(card.locator('.stock-frozen')).toContainText('stopped picking on 6 October 2026');
  await expect(card.locator('.stock-frozen')).toContainText('never merged with the current process');
  await expect(card.locator('.stock-disclaimer')).toContainText('Yahoo Finance');
});

test('the card fits the phone it is read on', async ({ page }) => {
  await openWith(page, PICK);
  await page.locator('section.stock').getByRole('button', { name: 'The evidence' }).click();
  await expect(page.locator('.stock-detail')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

/**
 * The open-position card: an earlier pick, still inside its 21-session hold, shown on a day that has no
 * pick of its own. The thing being checked is not that it renders — it reuses the brief — but that it is
 * never readable as today's decision.
 */
const OPEN_POSITION = {
  kind: 'open-position',
  strategyVersion: 2,
  date: '2026-10-08',
  heldSince: '2026-10-06',
  reason: 'Today’s pick has not been published yet.',
  pick: PICK,
};

test('an open position is dated and labelled, never presented as today’s pick', async ({ page }) => {
  await openWith(page, OPEN_POSITION);
  const card = page.locator('section.stock');
  // The frame says what it is, above anything else on the card.
  await expect(card.locator('.eyebrow')).toContainText('open position');
  await expect(card.locator('.eyebrow')).toContainText('not today’s decision');
  await expect(card).toContainText('Held since Oct 6');
  await expect(card).toContainText('has not been published yet');
  // The pick itself is intact underneath, with its own dates and its own evidence.
  await expect(card.getByRole('heading', { name: /Analog Devices/ })).toBeVisible();
  await expect(card.locator('.stock-horizon')).toContainText('21-session horizon');
  await expect(card.getByRole('heading', { name: 'What would show this was wrong' })).toBeVisible();
  // And nothing claims it was decided today.
  await expect(card).not.toContainText('Oct 8');
});

test('an empty card still says which test bound, when there is no open position either', async ({ page }) => {
  await openWith(page, {
    kind: 'unavailable',
    strategyVersion: 2,
    rule: 'Universe: every US-listed common stock on NYSE, Nasdaq or NYSE American.',
    reason: 'No candidate qualified today. The test that removed the most was trend: price below its 200-session average — 3,912 of 5,051 screened.',
    lastPublishedFor: '2026-09-30',
  });
  const card = page.locator('section.stock');
  await expect(card.getByRole('heading', { name: 'No qualifying pick today' })).toBeVisible();
  await expect(card).toContainText('The test that removed the most was trend');
  await expect(card).toContainText('3,912 of 5,051');
  await expect(card).toContainText('belongs to the session it was made in');
});
