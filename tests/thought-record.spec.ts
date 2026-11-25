import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyThought, thoughtSchema } from '../lib/becoming/thought-record';

test('Thought Record is skippable, keyboard navigable, and shares the Emotional Wheel vocabulary', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/thought-record');
  const guide = page.getByText('Optional guide to common thinking patterns', { exact: true });
  await expect(page.getByText('All-or-nothing thinking', { exact: true })).toBeHidden();
  await guide.click();
  await expect(page.getByText('All-or-nothing thinking', { exact: true })).toBeVisible();
  await guide.click();
  const next = page.getByRole('button', { name: 'Next step' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Step 2 of 5/ })).toBeFocused();
  await page.getByRole('checkbox', { name: 'Anxious' }).check();
  await page.getByRole('checkbox', { name: 'Frustrated' }).check();
  await page.getByRole('spinbutton', { name: /Emotional intensity before/ }).fill('0');
  await next.click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('checkbox', { name: 'Anxious' })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: /Emotional intensity before/ })).toHaveValue('0');
  await next.click();
  await next.click();
  await expect(page.getByRole('textbox', { name: 'Evidence that may not support the thought' })).toBeVisible();
  await next.click();
  await expect(page.getByRole('textbox', { name: 'Possible next action' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Emotional intensity after/ })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('Thought Record accepts skipped fields and rejects invalid ratings and dates', () => {
  expect(thoughtSchema.safeParse(emptyThought).success).toBe(true);
  expect(thoughtSchema.safeParse({ ...emptyThought, before: 0, after: 100 }).success).toBe(true);
  expect(thoughtSchema.safeParse({ ...emptyThought, before: 101 }).success).toBe(false);
  expect(thoughtSchema.safeParse({ ...emptyThought, date: '2026-02-30' }).success).toBe(false);
});
