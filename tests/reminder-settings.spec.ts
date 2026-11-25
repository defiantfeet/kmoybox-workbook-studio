import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { defaultReminderSettings, recurrenceKey, reminderClock, reminderKeys } from '../lib/becoming/reminders';
import { isQuiet } from '../lib/becoming/mood';

test('central notification settings expose schedules, channels, pause and quiet hours at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming');
  await page.getByRole('link', { name: 'Notification settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();
  for (const heading of ['Morning mood check-in', 'Midday mood check-in', 'Afternoon mood check-in', 'Evening mood check-in',
    'Habit activities','Personal goals','Social intentions','Weekly reflections','Wheel of Life assessments','Future-self letters']) {
    await expect(page.getByText(heading + ' · Off', { exact: true })).toBeVisible();
  }
  await page.getByText('Morning mood check-in · Off', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable morning mood check-in reminder' }).check();
  await page.getByRole('combobox', { name: 'Frequency' }).selectOption('weekly');
  await page.getByRole('combobox', { name: 'Day of week' }).selectOption('Tuesday');
  await page.getByRole('combobox', { name: 'Delivery channel' }).selectOption('Browser while Studio is open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('local scheduling respects repeated and skipped wall clock times', () => {
  const rules = defaultReminderSettings().rules;
  expect(Object.keys(rules)).toHaveLength(reminderKeys.length);
  const repeatedStart = reminderClock(new Date('2026-11-01T08:30:00Z'), 'America/Los_Angeles');
  const repeatedEnd = reminderClock(new Date('2026-11-01T09:30:00Z'), 'America/Los_Angeles');
  const rule = { ...rules.morning, enabled: true, time: '01:30' };
  expect(recurrenceKey(rule, repeatedStart, repeatedStart.day)).toBe(recurrenceKey(rule, repeatedEnd, repeatedEnd.day));
  const skipped = reminderClock(new Date('2026-03-08T10:01:00Z'), 'America/Los_Angeles');
  expect(recurrenceKey({ ...rule, time: '02:30' }, skipped, skipped.day)).toBe('2026-03-08');
  expect(isQuiet('00:30', '22:00', '06:00')).toBe(true);
});
