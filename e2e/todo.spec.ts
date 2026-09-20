import { test, expect, type Page } from '@playwright/test';

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
