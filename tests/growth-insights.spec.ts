import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { insightDayStart, insightRanges, insightsRange } from '../lib/becoming/insights';

test('Insights has accessible date filters, empty states and all nine module connections', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming');
  await page.getByRole('link', { name: 'Open Personal Growth Insights' }).click();
  await expect(page.getByRole('heading', { name: 'Personal Growth Insights' })).toBeVisible();
  const ranges = page.getByRole('navigation', { name: 'Insight date ranges' });
  await expect(ranges.getByRole('link')).toHaveCount(Object.keys(insightRanges).length);
  await expect(page.getByText('No numerical mood ratings in this period.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Descriptive insights' })).toHaveCount(0);
  const connections = page.getByRole('region', { name: 'Connect your work across modules' });
  await expect(connections.getByRole('listitem')).toHaveCount(9);
  await ranges.getByRole('link', { name: 'Custom range' }).click();
  await page.getByLabel('Start date', { exact: true }).fill('2025-01-01');
  await page.getByLabel('End date', { exact: true }).fill('2025-01-02');
  await page.getByRole('button', { name: 'Apply custom range' }).click();
  await expect(page).toHaveURL(/start=2025-01-01&end=2025-01-02/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('insights ranges use inclusive local days across DST and reject invalid custom ranges', () => {
  expect(insightsRange({ range: 'ninety' }, '2026-11-24', '2026-11-23').start).toBe('2026-08-27');
  expect(insightsRange({ range: 'custom', start: '2026-11-25', end: '2026-11-24' }, '2026-11-24', '2026-11-23').invalid).toBe(true);
  const { format } = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  expect(insightDayStart('2026-03-08', format)).toBe('2026-03-08T08:00:00.000Z');
  expect(insightDayStart('2026-03-09', format)).toBe('2026-03-09T07:00:00.000Z');
});
