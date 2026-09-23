import { test, expect, type Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 15_000 });
};

test('reachable from the tab bar and labelled for the right sport and season', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/home');
  await page.getByRole('button', { name: 'Water Polo' }).click();
  await expect(page.getByRole('heading', { name: 'Water Polo' })).toBeVisible();
  await expect(page.locator('.screen-header .sub')).toHaveText("Men's Water Polo · 2026");
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 15_000 });
  // The other four tabs are still there and still work.
  await expect(page.locator('.tabbar .tab')).toHaveCount(5);
  await page.getByRole('button', { name: 'Groceries' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
});

test('groups by game date, newest first, with both crests on every row', async ({ page }) => {
  await open(page);
  const headings = await page.locator('.section-title h2').allInnerTexts();
  expect(headings.length).toBeGreaterThan(3);

  // Newest day first.
  const parsed = headings.map((h) => Date.parse(`${h.replace(/^\w+, /, '')}, 2026`));
  expect(parsed).toEqual([...parsed].sort((a, b) => b - a));

  // Weekday games are included, not just weekends.
  expect(headings.some((h) => /^(Monday|Tuesday|Wednesday|Thursday|Friday)/.test(h))).toBe(true);

  const first = page.locator('.polo-row').first();
  await expect(first.locator('.polo-crest')).toHaveCount(2);
  await expect(first.locator('.polo-team')).toHaveCount(2);
  await expect(first.locator('.polo-score')).toHaveCount(1);
});

test('a game found on two schools’ sites appears once, with the scores the right way round', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Aug 29' }).click();
  // Brown beat Wagner 15-10 that day; Wagner's own page reports it as a 10-15 loss.
  const row = page.locator('.polo-row', { hasText: 'Brown' }).filter({ hasText: 'Wagner' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('15');
  await expect(row).toContainText('10');
  await row.click();
  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.polo-sheet-score')).toHaveText('Brown 15 – 10 Wagner');
  // Provenance: both schools, each linking to an official page.
  await expect(sheet.locator('.polo-sources li')).toHaveCount(2);
  for (const href of await sheet.locator('.polo-sources a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
    expect(href).toMatch(/^https:\/\/(brownbears|wagnerathletics)\.com\//);
  }
});

test('shows overtime only when it happened, and says who hosted', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Aug 29' }).click();
  const ot = page.locator('.polo-row', { hasText: 'LIU' }).filter({ hasText: 'Wagner' });
  await expect(ot.locator('.polo-ot')).toHaveText('2OT');
  await ot.click();
  const sheet = page.locator('.sheet');
  await expect(sheet.getByText('2 overtimes')).toBeVisible();
  await expect(sheet.getByText('Neutral site')).toBeVisible();
  await page.keyboard.press('Escape');
  // A game with no overtime carries no marker at all.
  const plain = page.locator('.polo-row', { hasText: 'Brown' }).filter({ hasText: 'Wagner' });
  await expect(plain.locator('.polo-ot')).toHaveCount(0);
});

test('date strip, day steppers and the way back to everything', async ({ page }) => {
  await open(page);
  const all = await page.locator('.polo-row').count();
  expect(all).toBeGreaterThan(50);

  await page.getByRole('button', { name: 'Sep 12' }).click();
  await expect(page.locator('.section-title h2')).toHaveCount(1);
  await expect(page.locator('.section-title h2')).toHaveText('Saturday, September 12');
  const onDay = await page.locator('.polo-row').count();
  expect(onDay).toBeLessThan(all);

  await page.getByRole('button', { name: 'Previous day with results' }).click();
  await expect(page.locator('.section-title h2')).toHaveText('Friday, September 11');
  await page.getByRole('button', { name: 'Next day with results' }).click();
  await expect(page.locator('.section-title h2')).toHaveText('Saturday, September 12');

  await page.getByRole('button', { name: 'All results' }).click();
  await expect(page.locator('.polo-row')).toHaveCount(all);
});

test('a day with no results says so instead of looking broken', async ({ page }) => {
  // Keep one game, on a date the strip will not offer, then ask for a different date.
  await page.route('**/data/waterpolo.json', async (route) => {
    const feed = await (await route.fetch()).json();
    feed.games = feed.games.slice(0, 1);
    await route.fulfill({ json: feed });
  });
  await open(page);
  const onlyDate = await page.locator('.polo-dates-chips .chip').nth(1).innerText();
  await page.locator('.polo-dates-chips .chip').nth(1).click();
  await expect(page.locator('.polo-row')).toHaveCount(1);
  // Deselecting that date leaves the full feed, which is the same single game.
  await page.getByRole('button', { name: onlyDate }).click();
  await expect(page.locator('.polo-row')).toHaveCount(1);
});

test('partial coverage is stated, not hidden', async ({ page }) => {
  await page.route('**/data/waterpolo.json', async (route) => {
    const feed = await (await route.fetch()).json();
    feed.sources[0] = { ...feed.sources[0], ok: false, error: 'HTTP 503', display: 'Air Force' };
    feed.sources[1] = { ...feed.sources[1], ok: false, error: 'timeout', display: 'Brown' };
    await route.fulfill({ json: feed });
  });
  await open(page);
  const line = page.locator('.polo-fresh');
  await expect(line).toContainText('11 of 13 schools');
  await expect(line).toContainText('Air Force');
  await expect(line).toContainText('Brown');
  // The results themselves are still there.
  expect(await page.locator('.polo-row').count()).toBeGreaterThan(50);
});

test('a disagreement between two schools shows one row and both readings', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Sep 4' }).click();
  const row = page.locator('.polo-row', { hasText: 'Princeton' }).filter({ hasText: 'George Washington' });
  await expect(row).toHaveCount(1);
  await row.click();
  const note = page.locator('.polo-conflict');
  await expect(note).toContainText('disagree');
  await expect(note.locator('.polo-readings li')).toHaveCount(2);
  await expect(note.locator('.polo-readings li').filter({ hasText: 'George Washington' })).toContainText('11 – 23');
  await expect(note.locator('.polo-readings li').filter({ hasText: 'Princeton' })).toContainText('12 – 23');
  // The result shown is the one the official recap settles on, with the evidence linked.
  await expect(page.locator('.polo-sheet-score')).toHaveText('George Washington 12 – 23 Princeton');
  await expect(note.getByRole('link', { name: 'Read it' })).toHaveAttribute('href', /goprincetontigers\.com\/news\//);
});

test('a withheld score is shown as unconfirmed rather than as a number', async ({ page }) => {
  await page.route('**/data/waterpolo.json', async (route) => {
    const feed = await (await route.fetch()).json();
    const g = feed.games[0];
    g.home.score = null;
    g.away.score = null;
    g.conflict = { detectedAt: feed.builtAt, withheld: true, readings: [
      { source: feed.sources[0].id, url: 'https://example.org/a', scores: { [g.home.team]: 9, [g.away.team]: 7 } },
      { source: feed.sources[1].id, url: 'https://example.org/b', scores: { [g.home.team]: 9, [g.away.team]: 8 } },
    ] };
    await route.fulfill({ json: feed });
  });
  await open(page);
  const row = page.locator('.polo-row').first();
  await expect(row.locator('.polo-unconfirmed')).toBeVisible();
  await row.click();
  await expect(page.locator('.polo-sheet-score')).toHaveText('Result not confirmed');
  await expect(page.locator('.polo-conflict')).toContainText('not shown rather than guessed');
});

test('a broken logo falls back to initials without breaking the row', async ({ page }) => {
  await page.route('**/logos/*.webp', (route) => route.abort());
  await open(page);
  const row = page.locator('.polo-row').first();
  await expect(row.locator('.polo-crest--initials')).toHaveCount(2);
  const box = await row.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // No horizontal overflow anywhere on the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('long team names wrap in full and scores stay aligned', async ({ page }) => {
  await open(page);
  const bad = await page.evaluate(() => {
    const clipped: string[] = [];
    for (const el of Array.from(document.querySelectorAll('.polo-team'))) {
      const probe = el.cloneNode(true) as HTMLElement;
      probe.style.cssText = getComputedStyle(el).cssText;
      probe.style.webkitLineClamp = 'unset';
      probe.style.display = 'block';
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.width = `${el.getBoundingClientRect().width}px`;
      el.parentElement!.appendChild(probe);
      if (probe.getBoundingClientRect().height > el.getBoundingClientRect().height + 1) clipped.push(el.textContent ?? '');
      probe.remove();
    }
    const widths = new Set(Array.from(document.querySelectorAll('.polo-score')).map((e) => Math.round(e.getBoundingClientRect().width)));
    return { clipped, scoreWidths: widths.size, overflowX: document.documentElement.scrollWidth > innerWidth };
  });
  expect(bad.clipped).toEqual([]);
  expect(bad.scoreWidths).toBe(1);
  expect(bad.overflowX).toBe(false);
});

test('the feed keeps working offline from the saved copy', async ({ page, context }) => {
  await open(page);
  const before = await page.locator('.polo-row').count();
  await context.setOffline(true);
  // Leave the screen and come back: the results are read from IndexedDB, not the network.
  await page.evaluate(() => { location.hash = '#/todo'; });
  await page.evaluate(() => { location.hash = '#/waterpolo'; });
  await expect(page.locator('.polo-row')).toHaveCount(before);
  await page.getByRole('button', { name: 'Check for new results' }).click();
  await expect(page.getByText(/Checked less than 10 minutes ago|offline|Couldn/)).toBeVisible();
  await expect(page.locator('.polo-row')).toHaveCount(before);
  await context.setOffline(false);
});

test('nothing on this screen reaches a school’s website', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) external.push(r.url());
  });
  await open(page);
  await page.getByRole('button', { name: 'Check for new results' }).click();
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
});
