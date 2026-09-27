import { test, expect, type Page } from '@playwright/test';
import { STARTED_WEEK_1, lessonsReady, seedKv } from './helpers';

/**
 * The lesson sequence starts Monday 2026-09-21, so 2026-09-27 is that week's Sunday — the day the
 * quiz is supposed to appear, and the day Paolo reported it missing.
 */
const SUNDAY = '2026-09-27T15:00:00Z'; // 11:00 in New York
const WEEK_START = '2026-09-21';

const openMorning = async (page: Page, at = SUNDAY, extra: Record<string, unknown> = {}) => {
  await page.clock.setFixedTime(new Date(at));
  await seedKv(page, '/?fixtures=1&seed=none#/home', { ...STARTED_WEEK_1, ...extra });
  await lessonsReady(page);
  // The card renders before the lesson packs arrive, so wait for a real day rather than the
  // "not downloaded yet" placeholder.
  await expect(page.locator('section.lesson').first().locator('.eyebrow').first()).toContainText(/Day \d of 7/, { timeout: 20_000 });
};

test('Sunday shows day 7 and leads straight to the 20-question quiz', async ({ page }) => {
  await openMorning(page);
  const card = page.locator('section.lesson').first();
  await expect(card.locator('.eyebrow').first()).toContainText('Day 7 of 7');

  const start = page.getByRole('button', { name: /Take this week's quiz — 20 questions/ });
  await expect(start).toBeVisible();
  await start.click();

  await expect(page).toHaveURL(new RegExp(`#/quiz/${WEEK_START}`));
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible();
  await expect(page.locator('.screen-header .sub')).toContainText('September 21');
  await expect(page.locator('.screen').getByText('1 / 20')).toBeVisible();
});

test('a pack downloaded before its quiz existed is replaced, not kept forever', async ({ page }) => {
  // Exactly Paolo's situation: the stored week-1 pack is the 19 September build, which had no quiz.
  // The old sync skipped any week it already had, so the quiz could never arrive.
  await openMorning(page, SUNDAY, {
    'lessons:weeks': [1],
    'lessons:week-1': {
      schemaVersion: 1,
      week: 1,
      theme: 'The stock market, from zero',
      version: 'stale00000000',
      lessons: Array.from({ length: 7 }, (_, i) => ({
        id: `week-01-d${i + 1}`, week: 1, day: i + 1, theme: 'The stock market, from zero',
        title: `Old lesson ${i + 1}`, explanation: ['old'], example: ['old'], exercise: null, readMinutes: 2,
      })),
    },
  });
  // The sync notices the version changed and replaces the pack, so the quiz appears.
  await expect(page.getByRole('button', { name: /Take this week's quiz — 20 questions/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('section.lesson').first()).not.toContainText('Old lesson');
});

test('every answer can be changed on a review step before submitting', async ({ page }) => {
  await page.clock.setFixedTime(new Date(SUNDAY));
  await seedKv(page, `/?fixtures=1&seed=none#/quiz/${WEEK_START}`, STARTED_WEEK_1);
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible({ timeout: 20_000 });

  // Answer the first three, then jump to the review list.
  for (let i = 0; i < 3; i++) {
    await page.getByRole('radio').first().click();
    if (i < 2) await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: 'Review all 20 answers' }).click();
  await expect(page.getByRole('heading', { name: 'Check your answers' })).toBeVisible();
  await expect(page.locator('.screen')).toContainText('3 of 20 answered');
  await expect(page.getByRole('button', { name: /Submit \(17 blank\)/ })).toBeVisible();

  // Tapping a question goes back to it and the choice can be changed.
  await page.locator('ol li button').first().click();
  await expect(page.locator('.screen').getByText('1 / 20')).toBeVisible();
  await page.getByRole('radio').nth(1).click();
  await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio').first()).toHaveAttribute('aria-checked', 'false');
});

test('answers survive leaving the screen and reloading the app', async ({ page }) => {
  await page.clock.setFixedTime(new Date(SUNDAY));
  await seedKv(page, `/?fixtures=1&seed=none#/quiz/${WEEK_START}`, STARTED_WEEK_1);
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('radio').nth(2).click();
  await expect(page.getByRole('radio').nth(2)).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio').nth(1).click();
  await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
  // Wait for the draft to reach storage rather than guessing at how long that takes.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const r = indexedDB.open('brooklyn-personal');
        r.onsuccess = () => {
          const db = r.result;
          const g = db.transaction('kv').objectStore('kv').get('lessonProgress');
          g.onsuccess = () => {
            db.close();
            const drafts = (g.result?.value as { quizDrafts?: { answers: (number | null)[] }[] })?.quizDrafts ?? [];
            resolve(drafts.some((d) => d.answers.filter((a) => a !== null).length === 2));
          };
        };
      }),
    null,
    { timeout: 10_000 },
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Review all 20 answers' }).click();
  await expect(page.locator('.screen')).toContainText('2 of 20 answered');
});

test('submitting gives a score out of 20, a percentage, corrections and a retake', async ({ page }) => {
  await page.clock.setFixedTime(new Date(SUNDAY));
  await seedKv(page, `/?fixtures=1&seed=none#/quiz/${WEEK_START}`, STARTED_WEEK_1);
  await expect(page.getByRole('heading', { name: 'Weekly quiz' })).toBeVisible({ timeout: 20_000 });

  // Answer everything with the first choice, so the score is real but not 20.
  // Each choice is saved to IndexedDB, so wait for the selection to register before advancing —
  // otherwise the next tap can land while the page is still re-rendering.
  for (let i = 0; i < 20; i++) {
    await page.getByRole('radio').first().click();
    await expect(page.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
    if (i < 19) {
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.locator('.screen').getByText(`${i + 2} / 20`)).toBeVisible();
    }
  }
  await page.getByRole('button', { name: 'Review answers' }).click();
  await page.getByRole('button', { name: /^Submit/ }).click();

  await expect(page.locator('h2').first()).toHaveText(/^\d+ \/ 20 \(\d+%\)$/);
  await expect(page.locator('ol li')).toHaveCount(20);
  await expect(page.locator('ol li').first()).toContainText('Correct:');
  await expect(page.getByRole('button', { name: 'Retake' })).toBeVisible();

  // The result is remembered and reopens on the result, not on question 1.
  await page.reload();
  await expect(page.locator('h2').first()).toHaveText(/^\d+ \/ 20 \(\d+%\)$/);
});

test('the quiz links to the week it covers, and that week shows all seven lessons', async ({ page }) => {
  await page.clock.setFixedTime(new Date(SUNDAY));
  await seedKv(page, `/?fixtures=1&seed=none#/week/${WEEK_START}`, STARTED_WEEK_1);
  await expect(page.getByRole('heading', { name: /This week.s lessons/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('section.lesson')).toHaveCount(7);
  await expect(page.locator('section.lesson').first().locator('.eyebrow')).toContainText('Day 1 of 7');
  await expect(page.locator('section.lesson').last().locator('.eyebrow')).toContainText('Day 7 of 7');
  // Each one carries real content, not just a title.
  await expect(page.locator('section.lesson').first()).toContainText('Explanation');
  await page.getByRole('button', { name: /Take this week's quiz — 20 questions/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/quiz/${WEEK_START}`));
});

test('a past edition shows its own lesson, not today’s', async ({ page }) => {
  // An edition from Wednesday of week 1. The date → week/day mapping is fixed, so this must resolve
  // to day 3 of the week-1 pack, whatever today's lesson happens to be.
  const past = {
    schemaVersion: 1,
    date: '2026-09-23',
    preparedAt: '2026-09-23T09:52:00.000Z',
    stories: [],
    sources: [],
    lessonRef: null,
  };
  await openMorning(page, SUNDAY, { 'edition:2026-09-23': past, 'edition:dates': ['2026-09-23'] });

  const todayTitle = await page.locator('section.lesson h2').first().innerText();

  await page.getByRole('button', { name: 'Past editions' }).click();
  await page.locator('.sheet li button').first().click();

  const archived = page.locator('section[aria-label="Lesson for this edition"]');
  await expect(archived).toBeVisible();
  await expect(archived.locator('.eyebrow')).toContainText('Day 3 of 7');
  await expect(archived).toContainText('Explanation');
  await expect(archived).toContainText('Example');
  await expect(archived.locator('h2')).not.toHaveText(todayTitle);

  // Reading an old lesson must not move today's lesson or mark anything read.
  await page.getByRole('button', { name: 'Back to latest' }).click();
  await expect(page.locator('section.lesson h2').first()).toHaveText(todayTitle);
  await expect(page.locator('section.lesson').first()).toContainText('Mark as read');
});

test('an archived Sunday links to that week’s quiz and its seven lessons', async ({ page }) => {
  const sundayEdition = {
    schemaVersion: 1,
    date: '2026-09-27',
    preparedAt: '2026-09-27T09:52:00.000Z',
    stories: [],
    sources: [],
    lessonRef: null,
  };
  await openMorning(page, SUNDAY, { 'edition:2026-09-27': sundayEdition, 'edition:dates': ['2026-09-27'] });
  await page.getByRole('button', { name: 'Past editions' }).click();
  await page.locator('.sheet li button').first().click();

  const archived = page.locator('section[aria-label="Lesson for this edition"]');
  await expect(archived.locator('.eyebrow')).toContainText('Day 7 of 7');
  await archived.getByRole('button', { name: /Take this week.s quiz/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/quiz/${WEEK_START}`));
  await expect(page.locator('.screen').getByText('1 / 20')).toBeVisible();
});
