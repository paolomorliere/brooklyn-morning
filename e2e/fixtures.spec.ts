import { test, expect, type Page } from '@playwright/test';

const RESULT_ROW = '.polo-row:not(.polo-row--fixture)';
const FIXTURE_ROW = '.polo-row--fixture';

/** A Monday in New York, so "this weekend" is the Friday to Sunday still to come. */
const MONDAY = '2026-09-28T15:00:00Z';

const open = async (page: Page, at = MONDAY) => {
  await page.clock.setFixedTime(new Date(at));
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator(RESULT_ROW).first()).toBeVisible({ timeout: 20_000 });
};

test('Monday shows the coming Friday to Sunday, labelled with its dates', async ({ page }) => {
  await open(page);
  const section = page.locator('.polo-weekend');
  await expect(section.getByRole('heading', { name: 'This weekend' })).toBeVisible();
  await expect(section.locator('.polo-weekend-range')).toContainText('Oct 2 – Oct 4');

  // The day headings are upper-cased by CSS, so compare without case.
  const days = (await section.locator('.polo-weekend-day').allInnerTexts()).map((d) => d.toLowerCase());
  expect(days.length).toBeGreaterThan(0);
  for (const d of days) expect(d).toMatch(/^(friday|saturday|sunday)/);
  // Earliest day first.
  expect(days).toEqual([...days].sort((a, b) => Date.parse(`${a.replace(/^\w+, /, '')}, 2026`) - Date.parse(`${b.replace(/^\w+, /, '')}, 2026`)));
});

test('the weekend section is kept apart from the results feed', async ({ page }) => {
  await open(page);
  // Fixtures never carry a score, results always do.
  const fixtures = page.locator(FIXTURE_ROW);
  expect(await fixtures.count()).toBeGreaterThan(0);
  await expect(fixtures.first().locator('.polo-score')).toHaveCount(0);
  await expect(page.locator(RESULT_ROW).first().locator('.polo-score')).toHaveCount(1);
  // And the results feed still starts with the most recent day.
  await expect(page.locator('section[aria-labelledby^="d-"] .section-title h2').first()).toBeVisible();
});

test('every fixture shows both teams, both crests and an honest time', async ({ page }) => {
  await open(page);
  const row = page.locator(FIXTURE_ROW).first();
  await expect(row.locator('.polo-crest')).toHaveCount(2);
  await expect(row.locator('.polo-name')).toHaveCount(2);

  const labels = (await page.locator(`${FIXTURE_ROW} .polo-when em`).allInnerTexts()).map((l) => l.toLowerCase());
  expect(labels.length).toBeGreaterThan(0);
  // Only three honest answers: Eastern, the venue's local time, or no time yet.
  for (const l of labels) expect(['et', 'local', 'no time yet']).toContain(l);
  // A time is only called ET when the source made its zone certain.
  const kinds = await page.locator(`${FIXTURE_ROW} .polo-when`).evaluateAll((els) => els.map((e) => e.className));
  for (const k of kinds) expect(k).toMatch(/polo-when--(et|local|tbd)/);
});

test('fixtures are ordered earliest first within a day', async ({ page }) => {
  await open(page);
  const times = await page.locator('.polo-weekend .polo-list').first().locator('.polo-when b').allInnerTexts();
  const minutes = times.filter((t) => t !== 'TBD').map((t) => {
    const [, h, m, ap] = /(\d+):(\d+) (AM|PM)/.exec(t)!;
    return ((Number(h) % 12) + (ap === 'PM' ? 12 : 0)) * 60 + Number(m);
  });
  expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  // A fixture with no published time sorts last, never first.
  if (times.includes('TBD')) expect(times.indexOf('TBD')).toBeGreaterThanOrEqual(minutes.length);
});

test('a fixture whose start time has passed says Awaiting result, and is not removed', async ({ page }) => {
  await page.route('**/data/waterpolo.json*', async (route) => {
    const feed = await (await route.fetch()).json();
    // One fixture on Friday of this weekend, at 10 a.m. Eastern.
    feed.games = [
      ...feed.games.filter((g: { status: string }) => g.status === 'final').slice(0, 3),
      {
        id: 'late', date: '2026-10-02', time: '10:00', timeZone: 'America/New_York', status: 'scheduled',
        home: { team: 'liu', score: null }, away: { team: 'iona', score: null }, hosted: 'liu',
        sources: [{ id: 'liu', url: 'https://liuathletics.com/x', verifiedAt: feed.builtAt }], conflict: null,
      },
    ];
    await route.fulfill({ json: feed });
  });
  // Friday afternoon: the start time has gone by and no score has been published.
  await open(page, '2026-10-02T20:00:00Z');
  const row = page.locator(FIXTURE_ROW);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Awaiting result');
  // Still on screen, and still not a result.
  await expect(row.locator('.polo-score')).toHaveCount(0);
});

test('a confirmed final moves the event out of Upcoming and into Results, once', async ({ page }) => {
  const fixture = {
    id: 'evt', date: '2026-10-02', time: '19:00', timeZone: 'America/New_York', status: 'scheduled',
    home: { team: 'liu', score: null }, away: { team: 'iona', score: null }, hosted: 'liu',
    sources: [{ id: 'liu', url: 'https://liuathletics.com/x', verifiedAt: '2026-09-28T12:00:00Z' }], conflict: null,
  };
  let played = false;
  await page.route('**/data/waterpolo.json*', async (route) => {
    const feed = await (await route.fetch()).json();
    // The same event, same id, in two states. `builtAt` moves because a real run produced it, and
    // the app only adopts a feed whose build is newer than the one it holds.
    feed.games = played
      ? [{ ...fixture, status: 'final', home: { team: 'liu', score: 14 }, away: { team: 'iona', score: 9 } }]
      : [fixture];
    if (played) feed.builtAt = '2026-10-02T23:30:00.000Z';
    await route.fulfill({ json: feed });
  });

  await page.clock.setFixedTime(new Date(MONDAY));
  await page.goto('/?fixtures=1&seed=none#/waterpolo');
  await expect(page.locator(FIXTURE_ROW)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator(RESULT_ROW)).toHaveCount(0);

  played = true;
  await page.reload();
  await expect(page.locator(RESULT_ROW)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator(FIXTURE_ROW)).toHaveCount(0);
  await expect(page.locator(RESULT_ROW)).toContainText('14');
});

test('the team and conference filters apply to fixtures too', async ({ page }) => {
  await open(page);
  const teamChips = page.getByRole('group', { name: 'Team' });
  await teamChips.getByRole('button', { name: 'LIU', exact: true }).click();
  const rows = page.locator(FIXTURE_ROW);
  for (const t of await rows.allInnerTexts()) expect(t).toContain('LIU');
});

test('team pages switch between Results and Schedule', async ({ page }) => {
  await page.clock.setFixedTime(new Date(MONDAY));
  await page.goto('/?fixtures=1&seed=none#/team/liu');
  await expect(page.locator('.polo-team-name')).toHaveText('LIU', { timeout: 20_000 });

  // Results is the default and shows completed games with scores.
  await expect(page.getByRole('button', { name: /^Results/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(RESULT_ROW).first().locator('.polo-score')).toHaveCount(1);

  await page.getByRole('button', { name: /^Schedule/ }).click();
  await expect(page.getByRole('button', { name: /^Schedule/ })).toHaveAttribute('aria-pressed', 'true');
  const fixtures = page.locator(FIXTURE_ROW);
  expect(await fixtures.count()).toBeGreaterThan(0);
  await expect(page.locator(RESULT_ROW)).toHaveCount(0);
  await expect(fixtures.first().locator('.polo-when')).toBeVisible();

  // Weekdays are included — the season is not only weekends.
  const days = await page.locator('section[aria-labelledby^="s-"] .section-title h2').allInnerTexts();
  expect(days.length).toBeGreaterThan(0);
  expect(days.some((d) => /^(Monday|Tuesday|Wednesday|Thursday|Friday)/.test(d))).toBe(true);
  // Earliest first.
  const parsed = days.map((d) => Date.parse(`${d.replace(/^\w+, /, '')}, 2026`));
  expect(parsed).toEqual([...parsed].sort((a, b) => a - b));
});

test('the chosen team view survives a trip to another team and back', async ({ page }) => {
  await page.clock.setFixedTime(new Date(MONDAY));
  await page.goto('/?fixtures=1&seed=none#/team/liu');
  await expect(page.locator('.polo-team-name')).toHaveText('LIU', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Schedule/ }).click();

  // Tap the opponent's name, which is whichever of the two is not LIU.
  const row = page.locator(FIXTURE_ROW).first();
  const names = row.locator('.polo-name');
  const first = (await names.first().innerText()).trim();
  await (first === 'LIU' ? names.last() : names.first()).click();
  await expect(page).toHaveURL(/#\/team\//);
  await expect(page.locator('.polo-team-name')).not.toHaveText('LIU');
  await expect(page.getByRole('button', { name: /^Schedule/ })).toHaveAttribute('aria-pressed', 'true');

  await page.goBack();
  await expect(page.locator('.polo-team-name')).toHaveText('LIU');
  await expect(page.getByRole('button', { name: /^Schedule/ })).toHaveAttribute('aria-pressed', 'true');
});

test('tapping a fixture’s team name opens that team, not the game sheet', async ({ page }) => {
  await open(page);
  await page.locator(FIXTURE_ROW).first().locator('.polo-name').first().click();
  await expect(page).toHaveURL(/#\/team\//);
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test('tapping elsewhere on a fixture opens its details', async ({ page }) => {
  await open(page);
  // The row's own padding, clear of both team names — a tap there is "anywhere else".
  await page.locator(FIXTURE_ROW).first().click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.sheet')).toContainText('Site');
});
