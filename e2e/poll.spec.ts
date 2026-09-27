import { test, expect, type Page } from '@playwright/test';

const openPoll = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/poll');
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 15_000 });
};

/**
 * The published poll, read the same way the screen reads it.
 *
 * The CWPA publishes a new one every Wednesday and the number of rows changes with it — 22 in
 * Week 3, 25 in Week 4 — so the tests check the screen against the file rather than against a
 * week that has since been superseded.
 */
async function publishedPoll(page: Page) {
  return page.evaluate(async () => {
    const r = await fetch('data/poll.json');
    return (await r.json()) as {
      week: number;
      publishedAt: string;
      previous: { label: string } | null;
      rows: { rank: string; team: string; previous: string | null; points: number | null; pointsText: string | null }[];
    };
  });
}

test('reached from the results screen and back again', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Top 20', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CWPA Top 20' })).toBeVisible();
  // A secondary screen: Back, no tab bar.
  await expect(page.locator('.tabbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.polo-row').first()).toBeVisible();
});

test('shows every published row, with the week and the date it was published', async ({ page }) => {
  await openPoll(page);
  const poll = await publishedPoll(page);
  await expect(page.locator('.polo-poll-title')).toContainText(`Top 20 · Week ${poll.week}`);
  await expect(page.locator('.polo-poll-sub')).toContainText('2026');

  const rows = page.locator('.polo-poll-table tbody tr');
  // Every published row, including ties and the receiving-votes entries below the twenty.
  await expect(rows).toHaveCount(poll.rows.length);
  expect(poll.rows.length).toBeGreaterThanOrEqual(20);

  const ranks = await rows.locator('.polo-pos').allInnerTexts();
  expect(ranks).toEqual(poll.rows.map((r) => r.rank));
  expect(ranks.filter((r) => r === 'RV').length).toBeGreaterThan(0);
  // Ties are kept as the CWPA wrote them, never resolved into an order it did not publish.
  for (const rank of ranks.filter((r) => r.includes('(T)'))) {
    expect(ranks.filter((r) => r === rank).length).toBeGreaterThan(1);
  }
});

test('the points are the CWPA’s, not a calculation', async ({ page }) => {
  await openPoll(page);
  const poll = await publishedPoll(page);
  const shown = await page.locator('.polo-poll-table tbody .polo-pts').allInnerTexts();
  // Character for character what the article published — nothing is recomputed on the way in.
  expect(shown).toEqual(poll.rows.map((r) => r.pointsText ?? '—'));
  // Tied teams carry identical points, which is the only reason they are tied.
  for (const rank of new Set(poll.rows.map((r) => r.rank).filter((r) => r.includes('(T)')))) {
    const tied = poll.rows.filter((r) => r.rank === rank);
    expect(new Set(tied.map((r) => r.points)).size).toBe(1);
  }
  await expect(page.locator('.polo-table-note')).toContainText('copied from the CWPA');
});

test('keeps the previous week’s column exactly as published', async ({ page }) => {
  await openPoll(page);
  const poll = await publishedPoll(page);
  await expect(page.locator('.polo-poll-table thead')).toContainText(poll.previous?.label ?? 'Prev');
  const shown = await page.locator('.polo-poll-table tbody .polo-prev').allInnerTexts();
  // "RV" and "18 (T)" survive verbatim rather than being turned into numbers.
  expect(shown).toEqual(poll.rows.map((r) => r.previous ?? '—'));
});

test('every row has a crest, and a broken image falls back to initials', async ({ page }) => {
  await openPoll(page);
  const poll = await publishedPoll(page);
  await expect(page.locator('.polo-poll-table tbody .polo-crest')).toHaveCount(poll.rows.length);
  await expect(page.locator('.polo-poll-table tbody .polo-crest--initials')).toHaveCount(0);

  await page.route('**/logos/*.webp', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.polo-poll-table tbody .polo-crest--initials')).toHaveCount(poll.rows.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('says when it is waiting for this week’s poll, and still shows the real one', async ({ page }) => {
  await page.route('**/data/poll.json', async (route) => {
    const poll = await (await route.fetch()).json();
    await route.fulfill({ json: { ...poll, awaiting: true } });
  });
  await openPoll(page);
  const poll = await publishedPoll(page);
  await expect(page.locator('.polo-partial')).toContainText('Awaiting this week’s poll');
  await expect(page.locator('.polo-partial')).toContainText(`Week ${poll.week}`);
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(poll.rows.length);
  // The manual retry has to open the POLL workflow. The results workflow does not fetch polls.
  await expect(page.locator('.polo-partial').getByRole('link', { name: 'Check now' })).toHaveAttribute(
    'href',
    /actions\/workflows\/poll\.yml$/,
  );
});

test('a published poll is never replaced by an older week', async ({ page }) => {
  await openPoll(page);
  const poll = await publishedPoll(page);
  await expect(page.locator('.polo-poll-title')).toContainText(`Week ${poll.week}`);
  // Serve an older poll, as a stale job would.
  await page.route('**/data/poll.json', async (route) => {
    const poll = await (await route.fetch()).json();
    await route.fulfill({ json: { ...poll, week: 1, builtAt: '2000-01-01T00:00:00.000Z', rows: poll.rows.slice(0, 3) } });
  });
  await page.getByRole('button', { name: 'Check for a new poll' }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('.polo-poll-title')).toContainText(`Week ${poll.week}`);
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(poll.rows.length);
});

test('a malformed poll file is refused and the saved one kept', async ({ page }) => {
  await openPoll(page);
  // Read the real file before the malformed one is served in its place.
  const poll = await publishedPoll(page);
  await page.route('**/data/poll.json', (route) => route.fulfill({ json: { schemaVersion: 1, rows: [] } }));
  await page.getByRole('button', { name: 'Check for a new poll' }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(poll.rows.length);
});

test('keeps working offline from the saved copy', async ({ page, context }) => {
  await openPoll(page);
  const rows = (await publishedPoll(page)).rows.length;
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/waterpolo'; });
  await page.evaluate(() => { location.hash = '#/poll'; });
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(rows);
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
