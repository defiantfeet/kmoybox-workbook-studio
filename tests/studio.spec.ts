import { expect, test } from '@playwright/test';

test('dashboard links and mobile keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome back, Alex\./ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('navigation').getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByText('alex@example.com')).toBeVisible();
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
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'View progress' }).click();
  await expect(page).toHaveURL(/\/progress$/);
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
  await expect(page.locator('details').filter({ hasText: 'A new reflection' }).getByRole('status')).toHaveText('Saved.');
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

test('dashboard sections, covers, and primary navigation work across viewport sizes', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Studio navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Dashboard', 'Workbooks', 'Journal', 'Goals', 'Account']);
  await expect(page.getByText('Sample content', { exact: true })).toBeVisible();
  for (const width of [1440, 820, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Continue My Workbook', 'Workbook Library', 'Daily Reflection', 'Weekly Goals', 'Progress Overview']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  const images = page.getByRole('region', { name: 'Workbook Library' }).locator('img');
  await expect(images).toHaveCount(3);
  await images.last().scrollIntoViewIfNeeded();
  await expect.poll(() => images.evaluateAll(items => items.filter(item => (item as HTMLImageElement).naturalWidth > 0).length)).toBe(3);
  await page.getByRole('link', { name: 'Continue workbook' }).click();
  await expect(page).toHaveURL(/\/workbooks\/finding-my-voice#exercise-3$/);
  await expect(page.locator('#exercise-3')).toContainText('Practice asking for what you need');
  await expect(page.locator("#exercise-3")).toBeInViewport();

  await nav.getByRole('link', { name: 'Workbooks' }).click();
  await expect(page.getByRole('heading', { name: 'Workbooks', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Your journal' })).toBeVisible();
  await nav.getByRole('link', { name: 'Dashboard' }).click();
  const reflection = await page.getByRole('region', { name: 'Daily Reflection' }).locator('p').innerText();
  await page.getByRole('link', { name: 'Reflect in your journal' }).click();
  await expect(page.locator('#new-entry')).toContainText(reflection);
});

test('dashboard weekly checklist persists and updates Goals and progress', async ({ page }) => {
  await page.goto('/');
  const checklist = page.getByRole('region', { name: 'Weekly Goals' });
  const title = 'Write one honest journal entry';
  const goal = checklist.getByRole('checkbox', { name: title });
  await expect(goal).not.toBeChecked();
  await goal.focus();
  await page.keyboard.press('Space');
  await expect(goal).toBeChecked();
  await expect(checklist.getByText('2 of 3 complete')).toBeVisible();
  await page.reload();
  await expect(goal).toBeChecked();
  await page.getByRole('link', { name: 'View goals' }).click();
  await expect(page.locator('summary').filter({ hasText: title })).toContainText('Completed');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'View progress' }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByRole('progressbar', { name: 'Goal completion' })).toHaveAttribute('aria-valuenow', '67');
});
