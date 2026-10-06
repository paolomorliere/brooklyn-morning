import { test, expect, type Locator, type Page } from '@playwright/test';

const fresh = async (page: Page) => {
  await page.goto('/?fixtures=1&seed=none#/todo');
  await expect(page.getByText('All clear')).toBeVisible();
};

test('rapid entry keeps focus and lands in the selected category', async ({ page }) => {
  await fresh(page);
  const input = page.getByRole('textbox', { name: 'New task' });
  await input.fill('First');
  await input.press('Enter');
  await expect(input).toBeFocused();
  await input.fill('Second');
  await input.press('Enter');
  await page.getByRole('radio', { name: 'LIU Water Polo' }).click();
  await input.fill('Order caps');
  await input.press('Enter');
  await expect(page.getByText('2 open').or(page.getByText('3 open'))).toBeVisible();
  const liu = page.locator('section.cat', { has: page.getByRole('heading', { name: 'LIU Water Polo' }) });
  await expect(liu.getByText('Order caps')).toBeVisible();
  await expect(page.locator('section.cat', { has: page.getByRole('heading', { name: 'Inbox' }) }).locator('li.task')).toHaveCount(2);
  await page.reload();
  await expect(page.getByText('Order caps')).toBeVisible(); // persisted in IndexedDB
});

test('complete moves to Completed strip and Undo restores', async ({ page }) => {
  await fresh(page);
  const input = page.getByRole('textbox', { name: 'New task' });
  await input.fill('Submit timesheet');
  await input.press('Enter');
  await page.getByRole('checkbox', { name: 'Complete Submit timesheet' }).click();
  await expect(page.locator('.completed-strip').getByText('Submit timesheet')).toBeVisible();
  await page.locator('.completed-strip').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.completed-strip')).toHaveCount(0);
  await expect(page.locator('li.task').getByText('Submit timesheet')).toBeVisible();
});

test('completed tasks older than 12 h are purged on resume', async ({ page }) => {
  await fresh(page);
  await page.getByRole('textbox', { name: 'New task' }).fill('Old one');
  await page.getByRole('textbox', { name: 'New task' }).press('Enter');
  await page.getByRole('checkbox', { name: 'Complete Old one' }).click();
  // Backdate completion directly in the database, then simulate a resume.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const q = indexedDB.open('brooklyn-personal'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const tx = db.transaction('tasks', 'readwrite');
    const all: IDBRequest<Array<Record<string, unknown>>> = tx.objectStore('tasks').getAll();
    await new Promise((r) => (all.onsuccess = r));
    for (const t of all.result) tx.objectStore('tasks').put({ ...t, completedAt: new Date(Date.now() - 13 * 3600e3).toISOString() });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.reload();
  await expect(page.getByText('All clear')).toBeVisible();
  await expect(page.locator('.completed-strip')).toHaveCount(0);
});

test('categories: add, rename, reorder, remove with move picker', async ({ page }) => {
  await fresh(page);
  await page.getByRole('textbox', { name: 'New task' }).fill('Plan trip');
  await page.getByRole('textbox', { name: 'New task' }).press('Enter');
  await page.getByRole('button', { name: 'Manage categories' }).click();
  const dialog = page.getByRole('dialog', { name: 'Categories' });
  await dialog.getByLabel('New category name').fill('Travel');
  await dialog.getByLabel('New category name').press('Enter');
  await expect(dialog.getByText('Travel', { exact: true })).toBeVisible();
  await dialog.getByLabel('New category name').fill('travel');
  await dialog.getByLabel('New category name').press('Enter');
  await expect(dialog.getByText('That name is already used')).toBeVisible();
  await dialog.getByRole('button', { name: 'Rename Travel' }).click();
  await dialog.getByLabel('Rename to').fill('Trips');
  await dialog.getByRole('button', { name: 'Save name' }).click();
  await expect(dialog.getByText('Trips', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Move Trips up' }).click();
  const names = await dialog.locator('li.row-btn .grow > div:first-child').allTextContents();
  expect(names.indexOf('Trips')).toBe(names.length - 2);
  // Move the Inbox task into Trips, then remove Trips → task must move where we say.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.locator('li.task').getByText('Plan trip').click();
  await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Trips' }).click();
  await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('section.cat', { has: page.getByRole('heading', { name: 'Trips' }) }).getByText('Plan trip')).toBeVisible();
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await dialog.getByRole('button', { name: 'Remove Trips' }).click();
  await dialog.getByRole('button', { name: '→ Personal' }).click();
  await expect(dialog.getByText('Trips', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('section.cat', { has: page.getByRole('heading', { name: 'Personal' }) }).getByText('Plan trip')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Trips' })).toHaveCount(0);
});

test('star filter shows only priority tasks', async ({ page }) => {
  await fresh(page);
  const input = page.getByRole('textbox', { name: 'New task' });
  for (const t of ['Alpha', 'Beta', 'Gamma']) { await input.fill(t); await input.press('Enter'); }
  await page.getByRole('button', { name: 'Mark priority' }).nth(1).click();
  await page.getByRole('button', { name: 'Show priority tasks only' }).click();
  await expect(page.locator('li.task')).toHaveCount(1);
  await expect(page.locator('li.task').getByText('Beta')).toBeVisible();
  await expect(page.getByText('1 priority · 3 open')).toBeVisible();
  await page.getByRole('button', { name: 'Show all tasks' }).click();
  await expect(page.locator('li.task')).toHaveCount(3);
});

/* ---------- press and hold to reorder ---------- */

const inbox = (page: Page) =>
  page.locator('section.cat', { has: page.getByRole('heading', { name: 'Inbox' }) });

const inboxOrder = (page: Page) => inbox(page).locator('li.task .task-text').allInnerTexts();

const addTasks = async (page: Page, names: string[]) => {
  const input = page.getByRole('textbox', { name: 'New task' });
  for (const n of names) {
    await input.fill(n);
    await input.press('Enter');
  }
  await expect(inbox(page).locator('li.task')).toHaveCount(names.length);
};

/** A press, a hold, then a drag — the gesture the screen is built around. */
async function pressAndDrag(page: Page, from: Locator, to: Locator, hold = 600) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('row not on screen');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(hold);
  await page.mouse.move(a.x + a.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

test('press and hold reorders a task, and the order survives a reload', async ({ page }) => {
  await fresh(page);
  await addTasks(page, ['Alpha', 'Bravo', 'Charlie']);
  expect(await inboxOrder(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

  const rows = inbox(page).locator('li.task');
  await pressAndDrag(page, rows.nth(0), rows.nth(2));
  await expect(inbox(page).locator('li.task').first()).toContainText('Bravo');
  expect(await inboxOrder(page)).toEqual(['Bravo', 'Charlie', 'Alpha']);

  // The drag must not also open, complete or star the row it moved.
  await expect(page.getByRole('heading', { name: 'Edit task' })).toHaveCount(0);
  await expect(page.locator('.completed-strip')).toHaveCount(0);

  await page.reload();
  await expect(inbox(page).locator('li.task')).toHaveCount(3);
  expect(await inboxOrder(page)).toEqual(['Bravo', 'Charlie', 'Alpha']);
});

test('a quick drag is a scroll, not a reorder, and a tap still opens the task', async ({ page }) => {
  await fresh(page);
  await addTasks(page, ['Alpha', 'Bravo', 'Charlie']);
  const rows = inbox(page).locator('li.task');

  // No hold: the finger moved before the press was long enough.
  await pressAndDrag(page, rows.nth(0), rows.nth(2), 0);
  expect(await inboxOrder(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

  // And an ordinary tap is untouched by any of this.
  await rows.nth(0).locator('.task-body').click();
  await expect(page.getByRole('heading', { name: 'Edit task' })).toBeVisible();
});

test('a drag cannot move a task past the priority block', async ({ page }) => {
  await fresh(page);
  await addTasks(page, ['Alpha', 'Bravo', 'Charlie']);
  await page.getByRole('button', { name: 'Mark priority' }).first().click();
  // Starring Alpha leaves it on top; Bravo and Charlie are the unstarred block.
  expect(await inboxOrder(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

  const rows = inbox(page).locator('li.task');
  // Drag the last task all the way above the starred one: it must stop below it.
  await pressAndDrag(page, rows.nth(2), rows.nth(0));
  expect(await inboxOrder(page)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  await expect(rows.nth(0).locator('.task-star')).toHaveAttribute('aria-pressed', 'true');
});

test('Move up and Move down reorder without a pointer gesture', async ({ page }) => {
  await fresh(page);
  await addTasks(page, ['Alpha', 'Bravo', 'Charlie']);

  await inbox(page).locator('li.task').nth(2).locator('.task-body').click();
  // Already last, so only one direction is open.
  await expect(page.getByText('3rd of 3 tasks.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move down' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move up' }).click();
  await expect(page.getByText('2nd of 3 tasks.')).toBeVisible();
  await page.getByRole('button', { name: 'Move up' }).click();
  await expect(page.getByText('1st of 3 tasks.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move up' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  expect(await inboxOrder(page)).toEqual(['Charlie', 'Alpha', 'Bravo']);
  await page.reload();
  await expect(inbox(page).locator('li.task')).toHaveCount(3);
  expect(await inboxOrder(page)).toEqual(['Charlie', 'Alpha', 'Bravo']);
});

test('Move up stops at the priority boundary', async ({ page }) => {
  await fresh(page);
  await addTasks(page, ['Alpha', 'Bravo']);
  await page.getByRole('button', { name: 'Mark priority' }).first().click();

  await inbox(page).locator('li.task').nth(1).locator('.task-body').click();
  await expect(page.getByText('1st of 1 task.')).toBeVisible();
  // One task in its block, so neither direction is possible.
  await expect(page.getByRole('button', { name: 'Move up' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move down' })).toBeDisabled();
});
