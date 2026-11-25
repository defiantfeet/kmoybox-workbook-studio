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
  const scheduledAt = new Date(Math.ceil((Date.now() + 20000) / 1000) * 1000);
  const utcInput = scheduledAt.toISOString().slice(0, scheduledAt.getUTCSeconds() ? 19 : 16);
  await page.getByLabel('Scheduled publication (UTC)').fill(utcInput);
  await page.getByRole('button', { name: 'Schedule publication' }).click();
  await expect(preview.getByText(/Version 2 · scheduled · Saved at/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Scheduled publication (UTC)')).toHaveValue(utcInput);
  const scheduledFor = page.getByRole('region', { name: 'Edit content' })
    .locator('form p', { hasText: 'Scheduled for' }).locator('time');
  await expect(scheduledFor).toHaveAttribute('datetime', scheduledAt.toISOString());
  await page.goto(prefix + '/becoming');
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('heading', { name: title })).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout: 30000, intervals: [1000] });
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toHaveCount(1);
  await page.goto(item);
  await expect(preview.getByText(/Version 2 · published · Saved at/)).toBeVisible();
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

test('scheduled dashboard reflections reach the journal and pending prompts can be canceled', async ({ page }) => {
  const email = process.env.STUDIO_AUTH_TEST_EDITOR_EMAIL;
  const password = process.env.STUDIO_AUTH_TEST_EDITOR_PASSWORD;
  test.skip(!email || !password, 'Provide a synthetic local account in workbook_editor_accounts.');
  await page.goto(prefix + '/login');
  await page.getByLabel('Email address').fill(email!);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const card = page.getByRole('region', { name: 'Daily Reflection' });
  const journalLink = card.getByRole('link', { name: 'Reflect in your journal' });
  const fallback = await card.locator('p').innerText();
  const fallbackHref = (await journalLink.getAttribute('href'))!;
  const journalPrompt = page.locator('.journal-prompt');
  await journalLink.click();
  await expect(journalPrompt).toHaveText(fallback);

  const prompt = 'What would make today feel more grounded? ' + randomUUID();
  const canceled = 'Canceled dashboard prompt ' + randomUUID();
  async function createDraft(title: string, body: string) {
    await page.goto(url);
    await page.getByLabel('Destination').selectOption({ label: 'Dashboard → Daily Reflection' });
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Content', { exact: true }).fill(body);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Reflection prompt · Dashboard → Daily Reflection')).toBeVisible();
    return page.url();
  }

  const entry = await createDraft('Scheduled dashboard reflection', prompt);
  const canceledEntry = await createDraft('Canceled dashboard reflection', canceled);
  const due = new Date(Math.ceil((Date.now() + 20000) / 1000) * 1000);
  const canceledDue = new Date(due.getTime() + 1000);
  async function schedule(item: string, release: Date) {
    await page.goto(item);
    await page.getByLabel('Scheduled publication (UTC)').fill(release.toISOString().slice(0, 19));
    await page.getByRole('button', { name: 'Schedule publication' }).click();
    await expect(page.getByText(/Version 2 · scheduled · Saved at/)).toBeVisible();
  }

  await schedule(entry, due);
  await schedule(canceledEntry, canceledDue);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Version 3 · draft · Saved at/)).toBeVisible();
  await page.goto(prefix + '/');
  await expect(card.locator('p')).toHaveText(fallback);
  await journalLink.click();
  await expect(journalPrompt).toHaveText(fallback);

  await expect(async () => {
    await page.goto(prefix + '/');
    await expect(card.locator('p')).toHaveText(prompt, { timeout: 500 });
  }).toPass({ timeout: 30000, intervals: [1000] });
  await journalLink.click();
  await expect(journalPrompt).toHaveText(prompt);

  await page.goto(fallbackHref);
  await expect(journalPrompt).toHaveText(fallback);
  await expect.poll(() => Date.now(), { timeout: 5000 }).toBeGreaterThan(canceledDue.getTime());
  await page.goto(prefix + '/');
  await expect(card.locator('p')).toHaveText(prompt);
  await journalLink.click();
  await expect(journalPrompt).toHaveText(prompt);
  await page.goto(canceledEntry);
  await expect(page.getByText(/Version 3 · draft · Saved at/)).toBeVisible();
  await expect(page.getByLabel('Scheduled publication (UTC)')).toHaveValue('');

  await page.goto(entry);
  await page.getByRole('button', { name: 'Archive content' }).click();
  await expect(page.getByText(/Version 3 · archived/)).toBeVisible();
});
