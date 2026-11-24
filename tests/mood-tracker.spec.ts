import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { average, defaultMoodSettings, dueMoodSlots, isQuiet } from '../lib/becoming/mood';

test('mood quick and detailed forms work on mobile, with missing days shown explicitly', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/mood-tracker');
  const quick = page.getByRole('region', { name: 'Add a voluntary check-in' });
  await quick.getByRole('combobox', { name: 'Overall mood rating (1 to 10)' }).selectOption('1');
  await quick.getByText('Detailed check-in (optional)', { exact: true }).click();
  await quick.getByRole('textbox', { name: 'Environmental stressors (optional)' }).fill('A loud room');
  await quick.getByText('Context tags (optional)', { exact: true }).click();
  await quick.getByRole('button', { name: 'Solitude', exact: true }).click();
  await expect(quick.getByRole('list', { name: 'Selected context tags' })).toContainText('Solitude');
  await page.getByRole('combobox', { name: 'Visualization' }).selectOption('Weekly mood trends');
  await expect(page.getByRole('table', { name: /Weekly mood trends/ }).getByText('No rating', { exact: true })).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('missing observations are excluded from means and overnight quiet hours wrap midnight', () => {
  expect(average([null, 1, 7])).toEqual({ value: 4, count: 2 });
  expect(average([null])).toEqual({ value: null, count: 0 });
  expect(isQuiet('00:15', '22:00', '07:00')).toBe(true);
  expect(isQuiet('07:00', '22:00', '07:00')).toBe(false);
  const settings = { ...defaultMoodSettings, reminders: true, quietStart: '22:00', quietEnd: '07:00' };
  expect(dueMoodSlots(settings, '23:10', 1, [])).toEqual([]);
  expect(dueMoodSlots(settings, '16:01', 1, ['morning'])).toEqual(['midday', 'afternoon']);
});
