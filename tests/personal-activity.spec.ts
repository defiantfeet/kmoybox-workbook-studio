import { expect, test } from '@playwright/test';

test('autosaves a linked journal reflection, restores mood, and searches title and text', async ({ page }) => {
  await page.goto('/journal');
  const editor = page.locator('#new-entry');
  await editor.getByLabel('Title', { exact: true }).fill('A quieter practice');
  await editor.getByLabel('What’s on your mind?').fill('I noticed a slower tempo helped.');
  await editor.getByLabel('Mood check-in (optional)').selectOption('calm');
  await editor.getByLabel('Workbook response (optional)').selectOption('legacy:1');
  await expect(editor.getByRole('status')).toHaveText('Saved.');
  await expect(page.locator('summary').filter({ hasText: 'A quieter practice' })).toContainText('Calm');
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search past reflections' }).fill('SLOWER TEMPO');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.locator('details').filter({ hasText: 'A quieter practice' });
  await expect(row).toHaveCount(1);
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.locator('details').filter({ hasText: 'Making space' })).toHaveCount(0);
  await row.locator('summary').click();
  await expect(row.getByRole('textbox', { name: 'Entry' })).toHaveValue('I noticed a slower tempo helped.');
  await expect(row.getByLabel('Mood check-in (optional)')).toHaveValue('calm');
  await expect(row.getByRole('link', { name: 'Open linked workbook exercise' })).toHaveAttribute('href', '/workbooks/finding-my-voice#exercise-1');
});

test('milestones update saved goal progress and history, and account data can be exported or deleted', async ({ page, browser }) => {
  const exercise = 'engine:10000000-0000-4000-8000-000000000003:20000000-0000-4000-8000-000000000008';
  await page.goto('/goals?attach=' + exercise);
  await page.getByLabel('Goal', { exact: true }).first().fill('Build a practice routine');
  await page.getByLabel('Target date (optional)').first().fill('2026-12-01');
  await expect(page.getByLabel('Workbook exercise (optional)').first()).toHaveValue(exercise);
  await page.getByRole('button', { name: 'Add goal' }).click();
  const goal = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Build a practice routine' }) });
  await goal.locator('summary').click();
  await goal.getByLabel('New milestone').fill('Choose a song');
  await goal.getByRole('button', { name: 'Add milestone' }).click();
  await goal.getByRole('button', { name: 'Complete Choose a song' }).click();
  await expect(goal.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(goal.getByText('Milestone completed · Choose a song')).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText('1 of 1 milestones complete')).toBeVisible();

  const exported = await page.request.get('/personal-data');
  expect(exported.ok()).toBeTruthy();
  expect(exported.headers()['cache-control']).toBe('private, no-store');
  const data = await exported.json();
  expect(data.goals).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Build a practice routine', workbook_ref: exercise })]));
  expect(data.milestones).toEqual([expect.objectContaining({ title: 'Choose a song', completed: true })]);
  const other = await browser.newContext();
  try {
    const separate = await other.request.get(new URL('/personal-data', page.url()).href);
    expect((await separate.json()).milestones).toEqual([]);
  } finally { await other.close(); }

  await page.getByRole('navigation').getByRole('link', { name: 'Account' }).click();
  await page.getByText('Delete personal activity', { exact: true }).click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete my activity' }).click();
  await expect(page.getByText('Personal activity deleted.')).toBeVisible();
  const reset = await (await page.request.get('/personal-data')).json();
  for (const field of ['journalEntries', 'goals', 'milestones', 'goalHistory', 'workbookResponses', 'moduleResponses']) {
    expect(reset[field]).toEqual([]);
  }
  await expect(page.getByRole('link', { name: 'My Library' })).toBeVisible();
});
