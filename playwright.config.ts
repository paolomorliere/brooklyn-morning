import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // The deployed-app check talks to GitHub Pages, so it is not part of the normal run.
  // `npm run e2e:deployed` runs it after a deploy.
  testIgnore: process.env.E2E_DEPLOYED ? [] : ['**/deployed.spec.ts'],
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', colorScheme: 'light' },
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } }, // 375 pt
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } }, // 390/393 pt class
    { name: 'iphone-14-pro-max', use: { ...devices['iPhone 14 Pro Max'] } }, // 430 pt
    // Paolo reads this on an iPad as well. Portrait is the narrowest tablet case that still clears the
    // 700 px tab-bar breakpoint; landscape is the widest thing the layout has to look deliberate in.
    { name: 'ipad-portrait', use: { ...devices['iPad (gen 7)'] } },
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
});
