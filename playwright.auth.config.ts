import { defineConfig } from '@playwright/test';

function loopback(value: string) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Auth tests require a local synthetic-data environment.');
  return url.origin;
}

export default defineConfig({
  testDir: './auth-tests',
  outputDir: 'test-results-auth',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: loopback(process.env.STUDIO_AUTH_TEST_URL ?? 'http://localhost:3000'),
    launchOptions: process.env.STUDIO_TEST_CHROMIUM ? { executablePath: process.env.STUDIO_TEST_CHROMIUM } : {},
  },
});
