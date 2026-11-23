import { expect, test } from '@playwright/test';

const dancer = '/workbooks/the-dancer-mindset';
const second = '10000000-0000-4000-8000-000000000002';
const reflection = 'What do you notice about how you’re arriving at practice today?';

test('saves a later module draft and resumes it with the saved response', async ({ page }) => {
  await page.goto('/workbooks');
  await page.getByRole('link', { name: 'Open The Dancer Mindset' }).click();
  await expect(page.getByText('Demonstration workbook', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Workbook chapters' }).getByRole('link', { name: /Make room for a second try/ }).click();
  await page.getByRole('textbox', { name: /Which part of a recent practice/ }).fill('I would mark the turn more slowly.');
  await page.getByRole('button', { name: 'Save responses' }).click();
  await expect(page.getByRole('status')).toHaveText('Responses saved.');
  await page.goto(dancer);
  await expect(page).toHaveURL(new RegExp('module=' + second));
  await expect(page.getByRole('textbox', { name: /Which part of a recent practice/ })).toHaveValue('I would mark the turn more slowly.');
  await expect(page.getByRole('progressbar', { name: 'Module completion' })).toHaveAttribute('aria-valuenow', '0');
});

test('validates completion, restores typed answers, and downloads a private PDF', async ({ page, browser }) => {
  await page.goto(dancer);
  await page.getByRole('textbox', { name: reflection }).fill('I’m curious, even though my timing feels rusty.');
  await page.getByRole('button', { name: 'Complete module' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: reflection })).toHaveValue('I’m curious, even though my timing feels rusty.');
  await page.getByRole('radio', { name: 'Exhale before the first count' }).check();
  await page.getByRole('radio', { name: '4', exact: true }).check();
  await page.getByRole('button', { name: 'Complete module' }).click();
  await expect(page.getByText('Module complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Module completion' })).toHaveAttribute('aria-valuenow', '33');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Exhale before the first count' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '4', exact: true })).toBeChecked();
  await page.getByRole('navigation', { name: 'Workbook chapters' }).getByRole('link', { name: /Plan one repeatable practice/ }).click();
  await page.getByRole('textbox', { name: 'My goal', exact: true }).fill('Practice a familiar phrase three times.');
  await page.getByRole('textbox', { name: 'My first step' }).fill('Put the track in a practice playlist.');
  await page.getByLabel('Target date (optional)').fill('2026-12-01');
  await page.getByRole('button', { name: 'Complete module' }).click();
  await expect(page.getByRole('progressbar', { name: 'Module completion' })).toHaveAttribute('aria-valuenow', '67');

  const pdf = await page.request.get('/workbook-pdf/the-dancer-mindset');
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()['cache-control']).toBe('private, no-store');
  const body = await pdf.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('link', { name: 'Download my responses (PDF)' }).click();
  expect((await download).suggestedFilename()).toBe('the-dancer-mindset-responses.pdf');
  const stranger = await browser.newContext();
  try {
    const empty = await stranger.request.get(new URL('/workbook-pdf/the-dancer-mindset', page.url()).href);
    expect(empty.ok()).toBeTruthy();
    expect((await empty.body()).byteLength).toBeLessThan(body.byteLength);
    const anotherPage = await stranger.newPage();
    await anotherPage.goto(new URL(dancer, page.url()).href);
    await expect(anotherPage.getByRole('textbox', { name: reflection })).toHaveValue('');
  } finally {
    await stranger.close();
  }
});

test('author creates, previews, edits and publishes a module without code', async ({ page }) => {
  await page.goto('/account');
  await page.getByRole('link', { name: 'Workbook content editor' }).click();
  await page.getByRole('textbox', { name: 'Workbook title' }).fill('Practicing Pause');
  await page.getByRole('textbox', { name: 'Workbook URL name' }).fill('practicing-pause');
  await page.getByRole('textbox', { name: 'Description' }).fill('A workbook created from the editor.');
  await page.getByRole('button', { name: 'Create workbook' }).click();
  await page.getByRole('link', { name: 'New module' }).click();
  await page.getByRole('textbox', { name: 'Module title' }).fill('Start with a pause');
  await page.getByLabel('Chapter title').fill('Begin here');
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('textbox', { name: 'Lesson text' }).fill('Pause long enough to take one easy breath.');
  await page.getByLabel('Block type').selectOption('reflection');
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('textbox', { name: 'Question or prompt' }).fill('What did you notice?');
  await page.getByRole('button', { name: 'Preview module' }).click();
  await expect(page.getByRole('region', { name: 'Module preview' }).getByText('What did you notice?')).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Draft saved.' })).toBeVisible();
  const draftUrl = page.url();
  await page.goto('/workbooks');
  await expect(page.getByRole('link', { name: 'Open Practicing Pause' })).toHaveCount(0);
  await page.goto(draftUrl);
  await page.getByRole('button', { name: 'Publish saved draft' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open published workbook' }).click();
  await expect(page.getByRole('textbox', { name: 'What did you notice?' })).toBeVisible();

  await page.goto(draftUrl);
  await page.getByRole('textbox', { name: 'Question or prompt' }).fill('What changed after that breath?');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Unpublished changes', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open published workbook' }).click();
  await expect(page.getByRole('textbox', { name: 'What did you notice?' })).toBeVisible();
  await page.goto(draftUrl);
  await page.getByRole('button', { name: 'Publish saved draft' }).click();
  await page.getByRole('link', { name: 'Open published workbook' }).click();
  await expect(page.getByRole('textbox', { name: 'What changed after that breath?' })).toBeVisible();
});
