/**
 * Checks the app that is actually deployed, not the one in this working tree.
 *
 * Kept out of the normal run because it talks to GitHub Pages: `npm run e2e:deployed` after a
 * deploy. Every assertion here is about a problem that was reported against the live app.
 */
import { test, expect } from '@playwright/test';

const SITE = 'https://paolomorliere.github.io/brooklyn-morning/';

test('the deployed app shows one Concordia row and this weekend', async ({ page }) => {
  await page.goto(`${SITE}#/waterpolo`);
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 40_000 });

  // The reported duplicate: one row, one identity, counted once.
  await page.getByRole('button', { name: 'Sep 26' }).click();
  const rows = page.locator('.polo-row', { hasText: 'Concordia' }).filter({ hasText: 'Harvard' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Concordia Irvine');
  await expect(rows).toContainText('19');
  await expect(rows).toContainText('18');

  await page.getByRole('button', { name: 'All results' }).click();
  await expect(page.getByRole('heading', { name: 'This weekend' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh scores and fixtures/ })).toBeVisible();
  await expect(page.locator('.polo-last')).toBeVisible();
});

test('the deployed app offers the Sunday quiz and a readable Library', async ({ page }) => {
  // Paolo's profile: the sequence started on the epoch Monday. A brand-new profile would correctly
  // have no week 1 to be quizzed on yet.
  await page.goto(`${SITE}#/home`);
  await page.waitForFunction(() => document.querySelector('.app') !== null, null, { timeout: 40_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const open = indexedDB.open('brooklyn-personal');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ key: 'lessonProgress', value: { startMonday: '2026-09-21', readLessonIds: [] } });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  // A full load, not a hash change: the stores read the profile once, at boot.
  await page.goto(`${SITE}?r=1#/quiz/2026-09-21`);
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('radio')).toHaveCount(4);
  await expect(page.locator('.screen').getByText('1 / 20')).toBeVisible();

  await page.goto(`${SITE}#/week/2026-09-21`);
  await expect(page.getByRole('heading', { name: /This week.s lessons/ })).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('section.lesson')).toHaveCount(7);
  await expect(page.locator('section.lesson').first()).toContainText('Explanation');
});

test('the deployed team page switches between Results and Schedule', async ({ page }) => {
  await page.goto(`${SITE}#/team/liu`);
  await expect(page.locator('.polo-team-name')).toHaveText('LIU', { timeout: 40_000 });
  await expect(page.locator('.polo-record b')).toHaveText(/^\d+–\d+/);
  await page.getByRole('button', { name: /^Schedule/ }).click();
  await expect(page.locator('.polo-row--fixture').first()).toBeVisible();
  await expect(page.locator('.polo-row--fixture').first().locator('.polo-when')).toBeVisible();
});

test('the deployed poll shows the published week', async ({ page }) => {
  await page.goto(`${SITE}#/poll`);
  await expect(page.locator('.polo-poll-table tbody tr').first()).toBeVisible({ timeout: 40_000 });
  // Read from the file the site is actually serving. Hardcoding the week and the row count meant
  // this test went red every time the CWPA published, which says nothing about the app.
  const poll = await page.evaluate(async () => {
    const r = await fetch('data/poll.json', { cache: 'no-store' });
    return (await r.json()) as {
      week: number;
      rows: { team: string }[];
      teams: Record<string, { logo: string | null } | undefined>;
    };
  });
  await expect(page.locator('.polo-poll-title')).toContainText(`Week ${poll.week}`);
  await expect(page.locator('.polo-poll-table tbody tr')).toHaveCount(poll.rows.length);
  // Initials only where the identity rules refuse to claim a school as one already known.
  const withoutLogo = poll.rows.filter((r) => !poll.teams[r.team]?.logo).length;
  await expect(page.locator('.polo-poll-table tbody .polo-crest--initials')).toHaveCount(withoutLogo);
});

test('the deployed app shows the Air Force result once, and no longer as a fixture', async ({ page }) => {
  // The reported case: Air Force v Wagner was still listed as a fixture with "no change found",
  // because a manual refresh was being skipped by the cron's guard and so never read the schools.
  await page.goto(`${SITE}#/waterpolo`);
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 40_000 });

  const pair = page.locator('.polo-row', { hasText: 'Air Force' }).filter({ hasText: 'Wagner' });
  await expect(pair).toHaveCount(1);
  // It is a result now, not a fixture, and it carries the real score.
  await expect(pair).not.toHaveClass(/polo-row--fixture/);
  await expect(pair).toContainText('16');
  await expect(pair).toContainText('15');
  // And that fixture is gone from "This weekend" — this one game, not every later Wagner fixture,
  // which is what the broader assertion started catching once a new weekend was published.
  const weekend = page.locator('.polo-weekend');
  await expect(weekend.locator('.polo-row', { hasText: 'Air Force' }).filter({ hasText: 'Wagner' })).toHaveCount(0);
});

test('the deployed refresh panel names each timestamp and offers no dropdown to get wrong', async ({ page }) => {
  await page.goto(`${SITE}#/waterpolo`);
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 40_000 });
  // Two lines, two different facts: the age of the data, and Paolo's own last attempt.
  await expect(page.locator('.polo-fresh')).toContainText('Scores read from the schools');
  await expect(page.locator('.polo-last')).toContainText(/Your last refresh|have not run a manual refresh/);
  // Never both wordings for one time.
  await expect(page.locator('.polo-last')).not.toContainText('Last successful refresh');
});

test('the deployed conference table lines its headers up with its numbers', async ({ page }) => {
  await page.goto(`${SITE}#/waterpolo`);
  await expect(page.locator('.polo-row').first()).toBeVisible({ timeout: 40_000 });
  await page.getByRole('button', { name: 'MAWPC', exact: true }).click();

  const table = page.locator('.polo-standings .polo-table');
  await expect(table).toBeVisible();
  const heads = table.locator('thead th.polo-num');
  const rows = table.locator('tbody tr');
  for (let i = 0; i < (await heads.count()); i++) {
    const head = await heads.nth(i).boundingBox();
    const cell = await rows.first().locator('td.polo-num').nth(i).boundingBox();
    expect(Math.abs((cell?.x ?? 0) - (head?.x ?? 0))).toBeLessThan(1);
    expect(await heads.nth(i).evaluate((el) => getComputedStyle(el).textAlign)).toBe('right');
  }
  // And the fixtures section is gone while a filter is on.
  await expect(page.getByRole('heading', { name: 'This weekend' })).toHaveCount(0);
  await expect(page.locator('.polo-standings')).toContainText('MAWPC schedule read');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('heading', { name: 'This weekend' })).toBeVisible();
});

test('the deployed To Do screen reorders a task by press and hold', async ({ page }) => {
  await page.goto(`${SITE}#/todo`);
  const input = page.getByRole('textbox', { name: 'New task' });
  await expect(input).toBeVisible({ timeout: 40_000 });

  // Two throwaway tasks, reordered, then removed again — this runs against Paolo's own device data.
  const names = [`zz-check-a-${Date.now()}`, `zz-check-b-${Date.now()}`];
  for (const n of names) {
    await input.fill(n);
    await input.press('Enter');
  }
  const rows = page.locator('li.task', { hasText: 'zz-check-' });
  await expect(rows).toHaveCount(2);

  const a = await rows.nth(0).boundingBox();
  const b = await rows.nth(1).boundingBox();
  if (!a || !b) throw new Error('rows not on screen');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(a.x + a.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();

  await expect(rows.first()).toContainText(names[1]);
  await page.reload();
  await expect(page.locator('li.task', { hasText: 'zz-check-' }).first()).toContainText(names[1], { timeout: 40_000 });

  for (const n of names) {
    await page.locator('li.task', { hasText: n }).locator('.task-body').click();
    await page.getByRole('button', { name: 'Delete task' }).click();
    await page.getByRole('button', { name: 'Tap again to delete permanently' }).click();
  }
  await expect(page.locator('li.task', { hasText: 'zz-check-' })).toHaveCount(0);
});

test('the deployed stock card is labelled for the rule that made it', async ({ page }) => {
  await page.goto('/#/home');
  const card = page.locator('section.stock');
  await expect(card).toBeVisible({ timeout: 20_000 });
  const eyebrow = (await card.locator('.eyebrow').innerText()).toLowerCase();
  expect(eyebrow).toContain('not a recommendation');

  if (await card.locator('.stock-score').count()) {
    // Version 2. Everything the plan requires the card to carry, checked against the live site.
    await expect(card.locator('.stock-horizon')).toContainText('21-session horizon');
    await expect(card.locator('.stock-score-k')).toContainText('ranking position');
    await expect(card.locator('.stock-score-k')).toContainText('chance of profit');
    await expect(card.getByRole('heading', { name: 'The strongest counterargument' })).toBeVisible();
    await expect(card.getByRole('heading', { name: 'What would show this was wrong' })).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Timing and risk' })).toBeVisible();
    await expect(card.locator('.stock-validation')).not.toBeEmpty();

    await card.getByRole('button', { name: 'The evidence' }).click();
    const detail = card.locator('.stock-detail');
    await expect(detail).toBeVisible();
    // Every figure states the period it covers, and the sources are named.
    const periods = await detail.locator('.stock-table').first().locator('tbody tr td:nth-child(3)').allInnerTexts();
    expect(periods.length).toBeGreaterThan(2);
    expect(periods.filter((p) => p.trim() && p.trim() !== '—').length).toBeGreaterThan(2);
    await expect(detail.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(detail).toContainText('SEC');
    await expect(card.locator('.stock-disclaimer')).toContainText('Not investment advice');
  } else if (await card.locator('.stock-metrics').count()) {
    // Version 1's card, still on screen until the version 2 feed is configured. It has to say what it
    // is: a frozen rule whose record is never merged with the current process.
    await expect(card.locator('.stock-frozen')).toContainText('stopped picking');
    await expect(card.locator('.stock-frozen')).toContainText('never merged with the current process');
  } else {
    // No card today. The reason has to be the test that actually bound, not a softened summary.
    await expect(card.getByRole('heading', { name: 'No qualifying pick today' })).toBeVisible();
    await expect(card.locator('p.muted.small')).not.toBeEmpty();
  }
});
