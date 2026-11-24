import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyFuture, futureFields, horizonDate, horizons } from '../lib/becoming/future';

test('the Future-Self editor offers optional sections, text cards and a letter on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/future-self-visualization');
  const horizon = page.getByRole('combobox', { name: 'Reflection horizon' });
  await expect(horizon.getByRole('option')).toHaveCount(horizons.length);
  await horizon.selectOption('Custom date');
  await expect(page.getByLabel('Custom horizon date')).toBeVisible();
  await page.getByText('Explore life areas', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Community contribution' }).fill('Make time to help out.');
  await page.getByText('Private vision board (optional)', { exact: true }).click();
  const add = page.getByRole('button', { name: 'Add a vision board card' });
  await add.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Vision board card 1' }).fill('A sunny workspace');
  await page.getByText('Letter to my future self (optional)', { exact: true }).click();
  await page.getByRole('textbox', { name: 'My letter' }).fill('Keep making room for what matters.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('future horizon dates handle leap years and calendar months', () => {
  expect(horizonDate('2024-02-29', '1 year', '')).toBe('2025-02-28');
  expect(horizonDate('2026-08-31', '6 months', '')).toBe('2027-02-28');
  expect(horizonDate('2026-12-31', '30 days', '')).toBe('2027-01-30');
  expect(horizonDate('2026-12-31', '90 days', '')).toBe('2027-03-31');
  expect(futureFields.safeParse({ ...emptyFuture, horizon: 'Custom date', customDate: '2026-02-30' }).success).toBe(false);
  expect(futureFields.parse({ ...emptyFuture, board: [' ', '  Private card  '] }).board).toEqual(['Private card']);
});
