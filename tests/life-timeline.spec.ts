import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyTimeline, timelineOrder, timelineSchema, type TimelineRecord, type TimelineWhen } from '../lib/becoming/timeline';

test('timeline date types are accessible and optional details stay optional on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/life-timeline');
  const timing = page.getByRole('combobox', { name: 'Timing type' });
  await timing.selectOption('approximate');
  await page.getByRole('textbox', { name: 'Approximate year' }).fill('2005');
  await expect(page.getByRole('combobox', { name: 'Month (optional)' })).toHaveValue('');
  await timing.selectOption('age');
  await page.getByRole('spinbutton', { name: 'Starting age' }).fill('18');
  await expect(page.getByRole('spinbutton', { name: 'Ending age' })).toHaveValue('18');
  await timing.selectOption('chapter');
  await expect(page.getByRole('textbox', { name: 'Life chapter or stage (optional)' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Future milestone' }).check();
  await expect(page.getByRole('region', { name: 'Add a life event' }).getByRole('link', { name: 'Open Future-Self Visualization' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('chronology preserves date precision and keeps age ranges and chapters separate', () => {
  const record = (id: string, timing: TimelineWhen): TimelineRecord => ({
    id, event: { ...emptyTimeline, title: id, timing }, revision: '', createdAt: '', image: false,
  });
  const input = [record('chapter', { mode: 'chapter', label: '' }), record('late', { mode: 'age', start: 20, end: 28 }),
    record('exact', { mode: 'exact', date: '2005-02-01' }), record('approx', { mode: 'approximate', year: '2005', month: '' }),
    record('early', { mode: 'age', start: 8, end: 10 })];
  expect(input.sort(timelineOrder).map(item => item.id)).toEqual(['approx', 'exact', 'early', 'late', 'chapter']);
  expect(timelineSchema.safeParse(record('invalid', { mode: 'age', start: 20, end: 10 }).event).success).toBe(false);
});
