import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', colorScheme: 'light' },
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } }, // 375 pt
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } }, // 390/393 pt class
    { name: 'iphone-14-pro-max', use: { ...devices['iPhone 14 Pro Max'] } }, // 430 pt
  ],
});
