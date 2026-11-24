import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const prefix = new URL(process.env.STUDIO_AUTH_TEST_URL ?? 'http://localhost:3000').pathname.replace(/\/$/, '');
const url = prefix + '/content-editor/personal-growth';

test('editor drafts, previews, publishes, and archives member-facing growth content', async ({ page }) => {
  const email = process.env.STUDIO_AUTH_TEST_EDITOR_EMAIL;
  const password = process.env.STUDIO_AUTH_TEST_EDITOR_PASSWORD;
  test.skip(!email || !password, 'Provide a synthetic local account in workbook_editor_accounts.');
  await page.goto(prefix + '/login');
  await page.getByLabel('Email address').fill(email!);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Open account' })).toBeVisible();
  await page.goto(prefix + '/content-editor');
  await page.getByRole('link', { name: 'Personal Growth Content Manager' }).click();
  await expect(page.getByRole('heading', { name: 'Personal Growth Content Manager' })).toBeVisible();
  const editor = page.getByRole('region', { name: 'Create content' });
  const title = 'Sample prompt ' + randomUUID();
  await editor.getByLabel('Title', { exact: true }).fill(title);
  await editor.getByLabel('Content', { exact: true }).fill('What supported you today?');
  await editor.getByRole('button', { name: 'Save draft' }).click();

  const preview = page.getByRole('region', { name: 'Preview of saved version' });
  await expect(preview.getByRole('heading', { name: title })).toBeVisible();
  const item = page.url();
  await page.goto(prefix + '/becoming');
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  await page.goto(item);
  const nextDay = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await page.getByLabel('Scheduled publication (UTC)').fill(nextDay);
  await page.getByRole('button', { name: 'Schedule publication' }).click();
  await expect(preview.getByText(/Version 2 · scheduled/)).toBeVisible();
  await page.goto(prefix + '/becoming');
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  await page.goto(item);
  await page.getByRole('button', { name: 'Publish now' }).click();
  await expect(preview.getByText(/Version 3 · published/)).toBeVisible();
  await page.goto(prefix + '/becoming');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.goto(item);
  await page.getByRole('button', { name: 'Archive content' }).click();
  await expect(preview.getByText(/Version 4 · archived/)).toBeVisible();
  await page.goto(prefix + '/becoming');
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
});

test('ordinary members cannot open the growth content editor', async ({ page }) => {
  const email = process.env.STUDIO_AUTH_TEST_MEMBER_EMAIL;
  const password = process.env.STUDIO_AUTH_TEST_MEMBER_PASSWORD;
  test.skip(!email || !password, 'Provide a synthetic local member account.');
  await page.goto(prefix + '/login');
  await page.getByLabel('Email address').fill(email!);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Open account' })).toBeVisible();
  await page.goto(prefix + '/account');
  await expect(page.getByRole('link', { name: 'Workbook content editor' })).toHaveCount(0);
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Personal Growth Content Manager' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Content library' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish now' })).toHaveCount(0);
});
