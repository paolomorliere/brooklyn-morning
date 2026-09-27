import { test, expect, type Page } from '@playwright/test';
import { STARTED_WEEK_1, seedKv } from './helpers';

const SUNDAY = '2026-09-27T15:00:00Z';

/** A story exactly as an edition stores it, so a saved entry can be resolved back to its text. */
const STORY = {
  id: 's1',
  topic: 'finance',
  title: "Ever wonder how the Fed's interest rate actually works?",
  publisher: 'NPR',
  url: 'https://www.npr.org/',
  publishedAt: '2026-09-22T11:00:00.000Z',
  excerpt: 'The Federal Reserve sets a target range rather than one rate.',
  excerptSource: 'rss',
  lead: 'Every six weeks, a committee meets in Washington and decides the price of money.',
  leadSource: 'extracted',
  isBackground: false,
  glossaryTerms: [],
};

const openLibrary = async (page: Page, extra: Record<string, unknown> = {}) => {
  await page.clock.setFixedTime(new Date(SUNDAY));
  await seedKv(page, '/?fixtures=1#/library', {
    ...STARTED_WEEK_1,
    'edition:dates': ['2026-09-22'],
    'edition:2026-09-22': {
      schemaVersion: 1, date: '2026-09-22', preparedAt: '2026-09-22T09:52:00.000Z',
      stories: [STORY], sources: [], lessonRef: null,
    },
    ...extra,
  });
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('li.task').first()).toBeVisible();
};

test('tapping a saved lesson reads it instead of opening the editor', async ({ page }) => {
  await openLibrary(page);
  // The fixture entry has only a title and the note "Week 1 · Day 1" — no content reference.
  const row = page.locator('li.task', { hasText: 'What a share actually is' });
  await row.locator('.task-body').click();

  await expect(page).toHaveURL(/#\/read\//);
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.reader-title')).toHaveText('What a share actually is');
  await expect(page.locator('.screen')).toContainText('Week 1 · Day 1 of 7');
  // The real lesson, not a title and a shrug.
  await expect(page.locator('.lesson-body')).toContainText('Explanation');
  await expect(page.locator('.lesson-body')).toContainText('Example');
});

test('a saved lesson keeps its exercise and answer reveal', async ({ page }) => {
  await openLibrary(page);
  await page.locator('li.task', { hasText: 'What a share actually is' }).locator('.task-body').click();
  const exercise = page.locator('.lesson-exercise');
  await expect(exercise).toBeVisible();
  await exercise.locator('summary').click();
  await expect(page.locator('.lesson-answer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.locator('.lesson-answer')).toBeVisible();
});

test('a saved lesson stays readable after the daily lesson moves on', async ({ page }) => {
  await openLibrary(page);
  await page.locator('li.task', { hasText: 'What a share actually is' }).locator('.task-body').click();
  const body = await page.locator('.lesson-body').innerText();

  // A week later: today's lesson is a different one, the saved one is unchanged.
  await page.clock.setFixedTime(new Date('2026-10-04T15:00:00Z'));
  await page.reload();
  await expect(page.locator('.reader-title')).toHaveText('What a share actually is');
  expect(await page.locator('.lesson-body').innerText()).toBe(body);
});

test('a saved story opens a readable story view with its original-source link', async ({ page }) => {
  await openLibrary(page);
  const row = page.locator('li.task', { hasText: 'Fed' });
  await row.locator('.task-body').click();

  await expect(page).toHaveURL(/#\/read\//);
  await expect(page.locator('.reader-title')).toContainText('Fed');
  await expect(page.locator('.screen')).toContainText('NPR');
  await expect(page.locator('.reader-body')).toContainText('Opening of the article');
  await expect(page.locator('.reader-body')).toContainText('Every six weeks');
  await expect(page.locator('.reader-body')).toContainText('From publisher');
  await expect(page.locator('.screen')).toContainText('not the publisher’s full article');
  await expect(page.getByRole('link', { name: /Read original article/ })).toHaveAttribute('href', 'https://www.npr.org/');
});

test('a story whose edition has expired says so and still links out', async ({ page }) => {
  // No edition holds this URL, so there is nothing to recover.
  await openLibrary(page, { 'edition:dates': [], 'edition:2026-09-22': null });
  await page.locator('li.task', { hasText: 'Fed' }).locator('.task-body').click();
  await expect(page.locator('.screen')).toContainText('no longer in the 14-day archive');
  await expect(page.getByRole('link', { name: /Read original article/ })).toBeVisible();
  // It never opens an empty reader.
  await expect(page.locator('.reader-body')).toHaveCount(0);
});

test('Edit is a separate action and does not break the content link', async ({ page }) => {
  await openLibrary(page);
  const row = page.locator('li.task', { hasText: 'What a share actually is' });
  // Read it first, so the repair that gives it a content reference has demonstrably happened.
  await row.locator('.task-body').click();
  await expect(page.locator('.lesson-body')).toContainText('Explanation');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('li.task').first()).toBeVisible();
  await row.getByRole('button', { name: /^Edit/ }).click();

  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await expect(page).not.toHaveURL(/#\/read\//);
  await sheet.locator('#lib-title').fill('My renamed lesson');
  await sheet.locator('#lib-note').fill('my own note');
  await sheet.getByRole('button', { name: 'Save' }).click();

  // Renamed, and still readable: the content reference survived the edit.
  const renamed = page.locator('li.task', { hasText: 'My renamed lesson' });
  await expect(renamed).toBeVisible();
  await renamed.locator('.task-body').click();
  await expect(page.locator('.reader-title')).toHaveText('What a share actually is');
  await expect(page.locator('.lesson-body')).toContainText('Explanation');
  await expect(page.locator('.screen')).toContainText('my own note');
});

test('the reader offers Edit, and Back returns to the Library where it was', async ({ page }) => {
  await openLibrary(page);
  await page.locator('li.task').first().locator('.task-body').click();
  await expect(page).toHaveURL(/#\/read\//);

  await page.getByRole('button', { name: 'Edit this saved item' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page).toHaveURL(/#\/library/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('li.task').first()).toBeVisible();
});

test('the Library keeps its search and tag filter across a trip to the reader', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Learning' }).click();
  await page.locator('.input').first().fill('share');
  await expect(page.locator('li.task')).toHaveCount(1);

  await page.locator('li.task').first().locator('.task-body').click();
  await expect(page).toHaveURL(/#\/read\//);
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page.locator('.input').first()).toHaveValue('share');
  await expect(page.getByRole('button', { name: 'Learning' })).toHaveAttribute('aria-pressed', 'true');
});

test('the repair never deletes or duplicates anything', async ({ page }) => {
  await openLibrary(page);
  const before = await page.locator('li.task').count();
  expect(before).toBe(4); // the four preview entries
  await page.reload();
  await expect(page.locator('li.task')).toHaveCount(before);
  // Titles, notes and tags are untouched.
  await expect(page.locator('li.task', { hasText: 'Lisbon in March' })).toContainText('Check flight prices in January');
  await expect(page.locator('li.task', { hasText: 'Water polo analytics' })).toContainText('Business idea');
});
