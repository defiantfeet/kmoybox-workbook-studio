import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { adherence, dailySchedule, habitRange, isScheduled, type Habit, type HabitLog } from '../lib/becoming/habits';

test('habit templates, schedule controls and calendar work at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/habit-tracker');
  await page.getByRole('combobox', { name: 'Optional template' }).selectOption('Read a page');
  await expect(page.getByRole('textbox', { name: 'New habit' })).toHaveValue('Read a page');
  await page.getByRole('combobox', { name: 'Frequency' }).selectOption('selected');
  await page.getByRole('checkbox', { name: 'Saturday' }).check();
  await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Calendar days' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('adherence uses scheduled opportunities through today and excludes rest', () => {
  const habit: Habit = { id: 'example', updated_at: '', archived_on: null, paused: false, title: 'Habit', category: '',
    motivation: '', core_value: '', notes: '', started_on: '2026-11-23', ends_on: null, preferred_time: null,
    reminder: false, completion_type: 'Minutes', schedule: { mode: 'custom', days: [], every: 2 },
    goal_id: null, source: '', schedule_history: [] };
  const logs = new Map<string, HabitLog>([
    ['2026-11-23', { habit_id: 'example', local_date: '2026-11-23', state: 'Completed', amount: 10 }],
    ['2026-11-25', { habit_id: 'example', local_date: '2026-11-25', state: 'Rest day', amount: null }],
    ['2026-11-27', { habit_id: 'example', local_date: '2026-11-27', state: 'Partially completed', amount: 5 }],
  ]);
  expect(adherence(habit, ['2026-11-23','2026-11-24','2026-11-25','2026-11-27','2026-11-29'], '2026-11-27', logs))
    .toEqual({ opportunities: 2, completed: 1, partial: 1, percent: 50 });
  habit.schedule_history = [
    { day: '2026-11-23', start: '2026-11-23', end: null, paused: false, schedule: dailySchedule },
    { day: '2026-11-25', start: '2026-11-23', end: null, paused: true, schedule: dailySchedule },
  ];
  expect(isScheduled(habit, '2026-11-24')).toBe(true);
  expect(isScheduled(habit, '2026-11-25')).toBe(false);
  expect(habitRange('2024-02-12', 'calendar')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
});
