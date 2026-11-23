import { expect, test } from '@playwright/test';

test('dashboard links and mobile keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back, Alex.' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('link', { name: 'My Library' }).click();
  await expect(page.getByRole('heading', { name: 'The Boundaries Edit' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Finding My Voice' })).toHaveCount(0);
});

test('workbook completion survives reload and updates progress', async ({ page }) => {
  await page.goto('/workbooks/finding-my-voice');
  const exercise = page.getByRole('heading', { name: 'Practice asking for what you need' }).locator('..');
  await exercise.getByRole('textbox').fill('I need a few minutes to think.');
  await exercise.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByRole('progressbar', { name: 'Workbook completion' })).toHaveAttribute('aria-valuenow', '75');
  await page.reload();
  await expect(exercise.getByRole('textbox')).toHaveValue('I need a few minutes to think.');
  await page.getByRole('link', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Finding My Voice completion' })).toHaveAttribute('aria-valuenow', '75');
});

test('journal and goals can be created, edited, completed, and removed', async ({ page }) => {
  await page.goto('/journal');
  await page.getByLabel('Title', { exact: true }).first().fill('A new reflection');
  await page.getByLabel('What’s on your mind?').fill('I made progress today.');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.getByText('A new reflection', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Entry', exact: true }).fill('I made a small but meaningful change.');
  await page.getByRole('button', { name: 'Update entry' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await page.getByText('A new reflection', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Entry', exact: true })).toHaveValue('I made a small but meaningful change.');
  await page.getByRole('button', { name: 'Delete entry' }).click();
  await expect(page.getByText('A new reflection', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Goals', exact: true }).click();
  await page.getByLabel('Goal', { exact: true }).first().fill('Take a walk');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByText('Take a walk', { exact: true }).click();
  await page.getByRole('button', { name: 'Complete goal' }).click();
  await expect(page.getByRole('button', { name: 'Reopen goal' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete goal' }).click();
  await expect(page.getByText('Take a walk', { exact: true })).toHaveCount(0);
});
