import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: process.env.STUDIO_TEST_CHROMIUM ? { executablePath: process.env.STUDIO_TEST_CHROMIUM } : {},
  },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    timeout: 120_000,
    env: { STUDIO_DEMO: '1', STUDIO_TEST_BUILD: '1' },
  },
});
