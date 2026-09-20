import { test, expect, type Page } from '@playwright/test';

const fresh = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/home');
};

test('renders the edition with honest labels and a lesson', async ({ page }) => {
  await fresh(page);
  await expect(page.getByRole('heading', { name: 'Brooklyn Morning' })).toBeVisible();
  await expect(page.locator('.masthead-meta .pill').first()).toHaveText(/Prepared|From/);
  await expect(page.locator('.story').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.label-src', { hasText: 'From publisher' }).first()).toBeVisible();
  // Topic order as agreed.
  const heads = await page.locator('.topic-head h2').allInnerTexts();
  expect(heads.map((h) => h.split('\n')[0])).toEqual(['AI & Data', 'World, US & France', 'Politics & Finance', 'Water polo', 'Soccer']);
  // Lesson card: day n of 7 and structure.
  const lesson = page.locator('section.lesson');
  await expect(lesson.getByText(/Day \d of 7/)).toBeVisible({ timeout: 15_000 });
  await expect(lesson.getByRole('heading', { name: 'Explanation' })).toBeVisible();
  await expect(lesson.getByRole('heading', { name: 'Example' })).toBeVisible();
  await lesson.getByText('Exercise (optional)').click();
  await lesson.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(lesson.locator('.lesson-answer')).toBeVisible();
  await lesson.getByRole('button', { name: 'Mark as read' }).click();
  await expect(lesson.getByRole('button', { name: 'Read ✓' })).toBeVisible();
});

test('opening paragraphs expand with their own label; glossary chips explain terms', async ({ page }) => {
  await fresh(page);
  await expect(page.getByRole('button', { name: 'Read the opening' }).first()).toBeVisible({ timeout: 15_000 });
  const stories = page.locator('.story');
  const n = await stories.count();
  let idx = 0;
  for (; idx < n; idx++) if (await stories.nth(idx).getByRole('button', { name: 'Read the opening' }).count()) break;
  const withLead = stories.nth(idx);
  await withLead.getByRole('button', { name: 'Read the opening' }).click();
  await expect(withLead.getByText(/Opening of the article/)).toBeVisible();
  const chip = page.locator('.gloss .pill').first();
  if (await chip.count()) {
    await chip.click();
    await expect(page.getByRole('dialog')).toContainText(/not financial or legal advice/);
  }
});

test('saving a story adds it to Library once', async ({ page }) => {
  await fresh(page);
  const story = page.locator('.story').first();
  await expect(story).toBeVisible({ timeout: 15_000 });
  const title = (await story.locator('h3').innerText()).trim();
  await story.getByRole('button', { name: 'Save to Library' }).click();
  await expect(story.getByRole('button', { name: 'Saved in Library' })).toBeVisible();
  await story.getByRole('button', { name: 'Saved in Library' }).click();
  await expect(page.getByText('Already in Library')).toBeVisible();
  await page.goto('/?fixtures=1&seed=none#/library');
  await expect(page.getByText(title.slice(0, 40))).toBeVisible();
});

test('offline: shows the last saved edition with a clear message; refresh is throttled', async ({ page, context }) => {
  await fresh(page);
  await expect(page.locator('.story').first()).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/todo'; });
  await page.evaluate(() => { location.hash = '#/home'; });
  await expect(page.locator('.story').first()).toBeVisible();
  await page.getByRole('button', { name: 'Refresh edition' }).click();
  await expect(page.getByText(/Checked less than 10 minutes ago|offline/)).toBeVisible();
  await context.setOffline(false);
});
