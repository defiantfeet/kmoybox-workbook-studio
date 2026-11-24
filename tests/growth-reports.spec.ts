import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { metricLabel, reportPeriod, reportQuestions } from '../lib/becoming/reports';

test('Growth Reports supports responsive period navigation, categories and guided questions', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming');
  await page.getByRole('link', { name: 'Open Growth Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Weekly Growth Report' })).toBeVisible();
  const edit = page.getByRole('region', { name: 'Edit reflections and categories' });
  await expect(edit.getByRole('textbox')).toHaveCount(Object.keys(reportQuestions).length);
  await edit.getByRole('checkbox', { name: 'Emotional check-ins', exact: true }).uncheck();
  await expect(page.getByRole('heading', { name: 'Emotional check-ins', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Monthly', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monthly Growth Report', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Compare with the previous period' }).click();
  await expect(page.getByText('No shared measures are available for these periods.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('periods use Monday starts and full calendar months, and metrics state sample sizes', () => {
  expect(reportPeriod('weekly', '2026-11-29')).toEqual({ start: '2026-11-23', end: '2026-11-29' });
  expect(reportPeriod('monthly', '2024-02-23')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  expect(metricLabel({ label: 'Average mood', value: 4.5, unit: '/ 10', sample: 2 })).toBe('4.5 / 10 (n = 2)');
});
