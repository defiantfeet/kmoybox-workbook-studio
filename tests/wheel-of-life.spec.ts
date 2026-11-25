import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyDomains, nextWheelReminder, wheelSchema, wheelTrends } from '../lib/becoming/wheel';

test('Wheel ratings update the chart and are operable by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/wheel-of-life');
  const radar = page.getByRole('group', { name: 'Radar chart axes' });
  await expect(radar.getByRole('button')).toHaveCount(8);
  const axis = radar.getByRole('button', { name: 'Edit rating for Career and education' });
  await axis.focus();
  await page.keyboard.press('Enter');
  const rating = page.getByRole('combobox', { name: 'Rating for Career and education' });
  await expect(rating).toBeFocused();
  const shape = page.locator('.wheel-shape');
  const before = await shape.getAttribute('style');
  await rating.selectOption('8');
  await expect(shape).not.toHaveAttribute('style', before!);
  await expect(page.getByText('1 of 8 domains rated')).toBeVisible();
  await page.getByRole('button', { name: 'Add domain' }).click();
  await page.getByRole('group', { name: '9. New domain' }).getByRole('textbox', { name: 'Domain name' }).fill('Learning music');
  await expect(radar.getByRole('button', { name: 'Edit rating for Learning music' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('Wheel validates ratings and dates reminder and trend periods in the selected timezone', () => {
  const domains = emptyDomains();
  expect(wheelSchema.safeParse({ domains }).success).toBe(true);
  expect(wheelSchema.safeParse({ domains: [{ ...domains[0], rating: 11 }] }).success).toBe(false);
  expect(wheelSchema.safeParse({ domains: [domains[0], { ...domains[1], label: domains[0].label.toUpperCase() }] }).success).toBe(false);
  expect(nextWheelReminder('2026-01-31', undefined, 'UTC')).toBe('2026-02-28');
  expect(nextWheelReminder(null, undefined, 'UTC')).toBeNull();
  const entries = [
    { id: 'a', completed_at: '2026-04-01T02:00:00Z', domains: [{ ...domains[0], rating: 8 }] },
    { id: 'b', completed_at: '2026-03-03T02:00:00Z', domains: [{ ...domains[0], rating: 6 }] },
  ];
  expect(wheelTrends(entries, 'America/Los_Angeles', 'month')[0]).toMatchObject({ period: '2026-03', entries: [{ average: '7.0', count: 2 }] });
  expect(wheelTrends(entries, 'UTC', 'quarter').map(row => row.period)).toEqual(['2026 Q2', '2026 Q1']);
});
