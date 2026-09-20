// Dev helper: capture iPhone-size screenshots of each screen from the running dev server.
import { webkit, devices } from '@playwright/test';
const base = process.env.BASE ?? 'http://localhost:5173';
const out = process.env.OUT ?? 'e2e/screenshots';
const shots = [
  ['home', '/?fixtures=1#/home', true],
  ['todo', '/?fixtures=1#/todo', false],
  ['groceries-list', '/?fixtures=1#/groceries', false],
  ['groceries-suggest', '/?fixtures=1&gstate=suggest#/groceries', false],
  ['groceries-first', '/?fixtures=1&gstate=first#/groceries', false],
  ['library', '/?fixtures=1#/library', false],
  ['settings', '/?fixtures=1#/settings', false],
];
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], colorScheme: 'light' });
const page = await ctx.newPage();
for (const [name, path, full] of shots) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: Boolean(full) });
  console.log('shot', name);
}
await browser.close();
