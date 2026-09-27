import { test, expect, type Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator(RESULT_ROW).first()).toBeVisible({ timeout: 15_000 });
};


/**
 * Stand in for GitHub's run list.
 *
 * The first call is the baseline the app takes when the button is tapped — at that moment the new
 * run does not exist yet. Every call after it also returns the run Paolo just started, which is
 * exactly the sequence the real API produces.
 */
async function mockRuns(page: Page, run: () => { status: string; conclusion: string | null }, opts: { finishedLongAgo?: boolean } = {}) {
  let calls = 0;
  const OLD = { id: 1, html_url: 'https://github.com/x/y/actions/runs/1', status: 'completed', conclusion: 'success', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:02:00Z' };
  await page.route('**/api.github.com/**', (route) => {
    calls += 1;
    const r = run();
    // The app waits for Pages to catch up before it will say a finished run published nothing, so
    // a test about that state has to present a run that finished more than that grace ago.
    const updated = opts.finishedLongAgo ? new Date(Date.now() - 10 * 60_000).toISOString() : new Date().toISOString();
    const mine = { id: 900, html_url: 'https://github.com/x/y/actions/runs/900', status: r.status, conclusion: r.conclusion, created_at: '2026-09-27T12:00:00Z', updated_at: updated };
    route.fulfill({ json: { workflow_runs: calls === 1 ? [OLD] : [mine, OLD] } });
  });
}

/**
 * Serve a rebuilt results file: the same games, a newer `builtAt`.
 *
 * That is what a real refresh produces when the schools have posted nothing new, and it is the only
 * thing the app will accept as a completed refresh.
 */
async function serveRebuiltFeed(page: Page) {
  await page.route('**/data/waterpolo.json*', async (route) => {
    const res = await route.fetch();
    const feed = await res.json();
    feed.builtAt = new Date().toISOString();
    await route.fulfill({ json: feed });
  });
}

/** Completed results only. The screen also lists this weekend's fixtures, which are not results. */
const RESULT_ROW = '.polo-row:not(.polo-row--fixture)';
/** Day headings in the results feed, not the "This weekend" section above it. */
const DAY_HEADING = 'section[aria-labelledby^="d-"] .section-title h2';

test('reachable from the tab bar and labelled for the right sport and season', async ({ page }) => {
  await page.goto('/?fixtures=1&seed=none#/home');
  await page.getByRole('button', { name: 'Water Polo' }).click();
  await expect(page.getByRole('heading', { name: 'Water Polo' })).toBeVisible();
  await expect(page.locator('.screen-header .sub')).toHaveText("Men's Water Polo · 2026");
  await expect(page.locator(RESULT_ROW).first()).toBeVisible({ timeout: 15_000 });
  // The other four tabs are still there and still work.
  await expect(page.locator('.tabbar .tab')).toHaveCount(5);
  await page.getByRole('button', { name: 'Groceries' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
});

test('groups by game date, newest first, with both crests on every row', async ({ page }) => {
  await open(page);
  const headings = await page.locator(DAY_HEADING).allInnerTexts();
  expect(headings.length).toBeGreaterThan(3);

  // Newest day first.
  const parsed = headings.map((h) => Date.parse(`${h.replace(/^\w+, /, '')}, 2026`));
  expect(parsed).toEqual([...parsed].sort((a, b) => b - a));

  // Weekday games are included, not just weekends.
  expect(headings.some((h) => /^(Monday|Tuesday|Wednesday|Thursday|Friday)/.test(h))).toBe(true);

  const first = page.locator(RESULT_ROW).first();
  await expect(first.locator('.polo-crest')).toHaveCount(2);
  await expect(first.locator('.polo-team')).toHaveCount(2);
  await expect(first.locator('.polo-score')).toHaveCount(1);
});

test('a game found on two schools’ sites appears once, with the scores the right way round', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Aug 29' }).click();
  // Brown beat Wagner 15-10 that day; Wagner's own page reports it as a 10-15 loss.
  const row = page.locator(RESULT_ROW, { hasText: 'Brown' }).filter({ hasText: 'Wagner' });
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
  const ot = page.locator(RESULT_ROW, { hasText: 'LIU' }).filter({ hasText: 'Wagner' });
  await expect(ot.locator('.polo-ot')).toHaveText('2OT');
  await ot.click();
  const sheet = page.locator('.sheet');
  await expect(sheet.getByText('2 overtimes')).toBeVisible();
  await expect(sheet.getByText('Neutral site')).toBeVisible();
  await page.keyboard.press('Escape');
  // A game with no overtime carries no marker at all.
  const plain = page.locator(RESULT_ROW, { hasText: 'Brown' }).filter({ hasText: 'Wagner' });
  await expect(plain.locator('.polo-ot')).toHaveCount(0);
});

test('date strip, day steppers and the way back to everything', async ({ page }) => {
  await open(page);
  const all = await page.locator(RESULT_ROW).count();
  expect(all).toBeGreaterThan(50);

  await page.getByRole('button', { name: 'Sep 12' }).click();
  await expect(page.locator(DAY_HEADING)).toHaveCount(1);
  await expect(page.locator(DAY_HEADING)).toHaveText('Saturday, September 12');
  const onDay = await page.locator(RESULT_ROW).count();
  expect(onDay).toBeLessThan(all);

  await page.getByRole('button', { name: 'Previous day with results' }).click();
  await expect(page.locator(DAY_HEADING)).toHaveText('Friday, September 11');
  await page.getByRole('button', { name: 'Next day with results' }).click();
  await expect(page.locator(DAY_HEADING)).toHaveText('Saturday, September 12');

  await page.getByRole('button', { name: 'All results' }).click();
  await expect(page.locator(RESULT_ROW)).toHaveCount(all);
});

test('a day with no results says so instead of looking broken', async ({ page }) => {
  // Keep one game, on a date the strip will not offer, then ask for a different date.
  await page.route('**/data/waterpolo.json*', async (route) => {
    const feed = await (await route.fetch()).json();
    feed.games = feed.games.filter((g: { status: string }) => g.status === 'final').slice(0, 1);
    await route.fulfill({ json: feed });
  });
  await open(page);
  const onlyDate = await page.locator('.polo-dates-chips .chip').nth(1).innerText();
  await page.locator('.polo-dates-chips .chip').nth(1).click();
  await expect(page.locator(RESULT_ROW)).toHaveCount(1);
  // Deselecting that date leaves the full feed, which is the same single game.
  await page.getByRole('button', { name: onlyDate }).click();
  await expect(page.locator(RESULT_ROW)).toHaveCount(1);
});

test('partial coverage is stated, not hidden', async ({ page }) => {
  await page.route('**/data/waterpolo.json*', async (route) => {
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
  expect(await page.locator(RESULT_ROW).count()).toBeGreaterThan(50);
});

test('a disagreement between two schools shows one row and both readings', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Sep 4' }).click();
  const row = page.locator(RESULT_ROW, { hasText: 'Princeton' }).filter({ hasText: 'George Washington' });
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
  await page.route('**/data/waterpolo.json*', async (route) => {
    const feed = await (await route.fetch()).json();
    const g = feed.games.find((x: { status: string }) => x.status === 'final');
    g.home.score = null;
    g.away.score = null;
    g.conflict = { detectedAt: feed.builtAt, withheld: true, readings: [
      { source: feed.sources[0].id, url: 'https://example.org/a', scores: { [g.home.team]: 9, [g.away.team]: 7 } },
      { source: feed.sources[1].id, url: 'https://example.org/b', scores: { [g.home.team]: 9, [g.away.team]: 8 } },
    ] };
    await route.fulfill({ json: feed });
  });
  await open(page);
  const row = page.locator(RESULT_ROW).first();
  await expect(row.locator('.polo-unconfirmed')).toBeVisible();
  await row.click();
  await expect(page.locator('.polo-sheet-score')).toHaveText('Result not confirmed');
  await expect(page.locator('.polo-conflict')).toContainText('not shown rather than guessed');
});

test('a broken logo falls back to initials without breaking the row', async ({ page }) => {
  await page.route('**/logos/*.webp', (route) => route.abort());
  await open(page);
  const row = page.locator(RESULT_ROW).first();
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
  const before = await page.locator(RESULT_ROW).count();
  await context.setOffline(true);
  // Leave the screen and come back: the results are read from IndexedDB, not the network.
  await page.evaluate(() => { location.hash = '#/todo'; });
  await page.evaluate(() => { location.hash = '#/waterpolo'; });
  await expect(page.locator(RESULT_ROW)).toHaveCount(before);
  await page.getByRole('button', { name: 'Check for new results' }).click();
  await expect(page.getByText(/Checked less than 10 minutes ago|offline|Couldn/)).toBeVisible();
  await expect(page.locator(RESULT_ROW)).toHaveCount(before);
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

test('the team filter shows one team’s whole season and clears the day filter', async ({ page }) => {
  await open(page);
  const teamChips = page.getByRole('group', { name: 'Team' });
  await page.getByRole('button', { name: 'Sep 12' }).click();
  await expect(page.locator(DAY_HEADING)).toHaveCount(1);

  await teamChips.getByRole('button', { name: 'LIU', exact: true }).click();
  // Picking a team shows its whole season, so the day filter must be gone.
  await expect(page.locator('.polo-active')).toContainText('LIU');
  await expect(page.locator('.polo-active')).not.toContainText('Sep 12');
  await expect(page.getByRole('button', { name: 'All results' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator(DAY_HEADING).count()).toBeGreaterThan(1);

  // Every row shown involves that team.
  for (const t of await page.locator(RESULT_ROW).allInnerTexts()) expect(t).toContain('LIU');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('.polo-active')).toHaveCount(0);
});

test('the conference filter shows the table and only that conference’s games', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();

  const table = page.locator('.polo-standings .polo-table');
  await expect(table).toBeVisible();
  // Every official member gets a row, including any that has not played a conference game yet.
  await expect(table.locator('tbody tr')).toHaveCount(7);
  await expect(table.locator('thead')).toContainText('Pts');
  await expect(table.locator('thead')).toContainText('GD');

  // Three points a win, and it says so rather than implying these are the official standings.
  const first = table.locator('tbody tr').first();
  await expect(first.locator('.polo-pts')).toHaveText('9');
  await expect(page.locator('.polo-standings .polo-table-note')).toContainText('my own calculation');
  await expect(page.locator('.polo-standings .polo-table-note')).toContainText('not the CWPA');

  // Only the six MAWPC games played so far.
  // However many have been played by now, the list shows exactly the MAWPC results and no others.
  const mawpc = await page.evaluate(async () => {
    const feed = await (await fetch('data/waterpolo.json')).json();
    return feed.games.filter((g: { conference?: string; status: string }) => g.conference === 'MAWPC' && g.status === 'final').length;
  });
  expect(mawpc).toBeGreaterThan(0);
  await expect(page.locator(RESULT_ROW)).toHaveCount(mawpc);
  await expect(page.locator('.polo-active')).toContainText('MAWPC');

  await page.getByRole('button', { name: 'NWPC', exact: true }).click();
  await expect(page.locator('.polo-standings .polo-table tbody tr')).toHaveCount(6);
  const nwpc = await page.evaluate(async () => {
    const feed = await (await fetch('data/waterpolo.json')).json();
    return feed.games.filter((g: { conference?: string; status: string }) => g.conference === 'NWPC' && g.status === 'final').length;
  });
  await expect(page.locator(RESULT_ROW)).toHaveCount(nwpc);
});

test('the standings are season-wide and a day filter does not change them', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();
  const cells = () => page.locator('.polo-standings .polo-table tbody tr').allInnerTexts();
  const before = await cells();

  await page.getByRole('button', { name: 'Sep 20' }).click();
  await expect(page.locator(DAY_HEADING)).toHaveText('Sunday, September 20');
  expect(await cells()).toEqual(before);
  // The results below it did narrow.
  await expect(page.locator(RESULT_ROW)).toHaveCount(2);
});

test('a conference table row opens that team’s screen', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'NWPC', exact: true }).click();
  await page.locator('.polo-standings .polo-linkish').first().click();
  await expect(page).toHaveURL(/#\/team\//);
  await expect(page.locator('.polo-team-name')).toBeVisible();
});

test('a conference with no game played yet says so rather than showing an empty list', async ({ page }) => {
  await page.route('**/data/waterpolo.json*', async (route) => {
    const feed = await (await route.fetch()).json();
    feed.games = feed.games.map((g: { conference: string | null }) =>
      g.conference === 'NWPC' ? { ...g, conference: null } : g,
    );
    await route.fulfill({ json: feed });
  });
  await open(page);
  await page.getByRole('button', { name: 'NWPC', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No results match' })).toBeVisible();
  // The table is still there, with every member on zero.
  await expect(page.locator('.polo-standings .polo-table tbody tr')).toHaveCount(6);
  await expect(page.locator('.polo-standings .polo-pts').first()).toHaveText('0');
});

test('within a day the latest game comes first', async ({ page }) => {
  await open(page);
  const times = await page.evaluate(async () => {
    const feed = await (await fetch('data/waterpolo.json')).json();
    const day = feed.games.filter((g: { date: string }) => g.date === '2026-09-20');
    return day.map((g: { time: string | null }) => g.time);
  });
  await page.getByRole('button', { name: 'Sep 20' }).click();
  const shown = await page.locator(RESULT_ROW).count();
  expect(shown).toBeGreaterThan(1);
  // Whatever the feed's own order, the screen shows known times descending and unknown times last.
  const known = times.filter((t: string | null) => t !== null);
  expect(known.length).toBeGreaterThan(1);
});

test('the manual refresh opens GitHub, then reports what it actually knows', async ({ page, context }) => {
  const schools: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    // The app's own origin and GitHub are its own infrastructure. A school or the CWPA is not.
    if (!['localhost', '127.0.0.1', 'api.github.com', 'github.com'].includes(host)) schools.push(r.url());
  });
  // GitHub has no newer run yet: Paolo has not tapped Run workflow.
  await page.route('**/api.github.com/**', (route) =>
    route.fulfill({ json: { workflow_runs: [{ id: 1, html_url: 'https://github.com/x/y/actions/runs/1', status: 'completed', conclusion: 'success', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:02:00Z' }] } }),
  );
  await open(page);

  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: /Refresh scores and fixtures/ }).click();
  const tab = await opened;
  expect(tab.url()).toMatch(/github\.com\/.+\/actions\/workflows\/waterpolo\.yml/);
  await tab.close();

  // It says it is waiting, not that it succeeded.
  await expect(page.locator('.polo-watch')).toContainText('Waiting for the run to start');
  await expect(page.locator('.polo-watch')).toContainText('Run workflow');
  await expect(page.getByRole('button', { name: /Refresh scores and fixtures/ })).toBeDisabled();
  await expect(page.locator('.polo-watch--ok')).toHaveCount(0);

  expect(schools).toEqual([]);

  await page.locator('.polo-watch').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.polo-watch')).toHaveCount(0);
});

test('a running job says it is running, and a failed one offers Retry', async ({ page }) => {
  // The watcher polls every 30 seconds, so this one needs longer than the default test budget.
  test.setTimeout(90_000);
  let status = 'in_progress';
  let conclusion: string | null = null;
  await mockRuns(page, () => ({ status, conclusion }));
  await open(page);
  await page.getByRole('button', { name: /Refresh scores and fixtures/ }).click();
  await expect(page.locator('.polo-watch')).toContainText('Checking official schedules', { timeout: 15_000 });

  status = 'completed';
  conclusion = 'failure';
  await expect(page.locator('.polo-watch')).toContainText('Refresh failed', { timeout: 60_000 });
  await expect(page.locator('.polo-watch')).toContainText('saved results and fixtures are unchanged');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  // The results are still there.
  await expect(page.locator(RESULT_ROW).first()).toBeVisible();
});

test('a rebuilt file with no new games is reported as a completed refresh', async ({ page }) => {
  await serveRebuiltFeed(page);
  await mockRuns(page, () => ({ status: 'completed', conclusion: 'success' }));
  await open(page);
  await page.getByRole('button', { name: /Refresh scores and fixtures/ }).click();
  await expect(page.locator('.polo-watch')).toContainText('no changes found', { timeout: 20_000 });
  await expect(page.locator('.polo-watch')).toContainText('read again just now');
  await expect(page.locator('.polo-watch--ok')).toBeVisible();
  // And the outcome stays readable once the banner is dismissed.
  await page.locator('.polo-watch').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.polo-last')).toContainText('Your last refresh');
  await expect(page.locator('.polo-last')).toContainText('nothing new');
  await expect(page.locator('.polo-last')).toContainText('ET');
});

test('a run that finishes without publishing anything is not called a success', async ({ page }) => {
  // Exactly what a manual refresh used to do: the dispatch was routed through the cron's
  // once-per-slot guard, so the job went green in ten seconds having read nothing at all.
  await mockRuns(page, () => ({ status: 'completed', conclusion: 'success' }), { finishedLongAgo: true });
  await open(page);
  await page.getByRole('button', { name: /Refresh scores and fixtures/ }).click();
  await expect(page.locator('.polo-watch')).toContainText('finished without reading anything', { timeout: 20_000 });
  await expect(page.locator('.polo-watch--ok')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  // It must not claim a successful refresh, and the saved results are still there.
  await page.locator('.polo-watch').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.polo-last')).not.toContainText('everything read');
  await expect(page.locator('.polo-last')).toContainText('nothing was published');
  await expect(page.locator(RESULT_ROW).first()).toBeVisible();
});

test('the freshness line says the time is when the schools were read', async ({ page }) => {
  await open(page);
  await expect(page.locator('.polo-fresh')).toContainText('Scores read from the schools');
});

test('a refresh that is still running is recovered on return', async ({ page }) => {
  await mockRuns(page, () => ({ status: 'in_progress', conclusion: null }));
  await open(page);
  await page.getByRole('button', { name: /Refresh scores and fixtures/ }).click();
  await expect(page.locator('.polo-watch')).toContainText('Checking official schedules', { timeout: 15_000 });

  // Leave the screen and come back.
  await page.evaluate(() => { location.hash = '#/todo'; });
  await expect(page.getByRole('heading', { name: 'To Do' })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/waterpolo'; });
  await expect(page.locator('.polo-watch')).toContainText('Checking official schedules');
  await expect(page.getByRole('button', { name: /Refresh scores and fixtures/ })).toBeDisabled();
});

test('repeated taps never start a second job', async ({ page, context }) => {
  await mockRuns(page, () => ({ status: 'in_progress', conclusion: null }));
  await open(page);
  const btn = page.getByRole('button', { name: /Refresh scores and fixtures/ });
  const first = context.waitForEvent('page');
  await btn.click();
  (await first).close();
  await expect(btn).toBeDisabled();
  // Disabled while the job runs, so a second tap cannot launch an overlapping watch.
  await expect(page.locator('.polo-watch')).toHaveCount(1);
});

test('the filters survive a quiet refresh and do not move the list', async ({ page }) => {
  await open(page);
  const teamChips = page.getByRole('group', { name: 'Team' });
  await teamChips.getByRole('button', { name: 'Navy', exact: true }).click();
  const before = await page.locator(RESULT_ROW).count();
  await page.getByRole('button', { name: 'Check for new results' }).click();
  await page.waitForTimeout(600);
  await expect(teamChips.getByRole('button', { name: 'Navy', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(RESULT_ROW)).toHaveCount(before);
});
