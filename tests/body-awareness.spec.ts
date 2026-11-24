import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bodySchema, emptyMovement, emptyObservation } from '../lib/becoming/body';

test('the two views and region checklist share keyboard-accessible selection on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/body-awareness-map');
  const front = page.getByRole('group', { name: 'Front body region selector' });
  await front.getByRole('button', { name: 'Jaw', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Jaw' })).toBeChecked();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const back = page.getByRole('group', { name: 'Back body region selector' });
  await page.getByRole('checkbox', { name: 'Upper back' }).check();
  await expect(back.getByRole('button', { name: 'Upper back' })).toHaveAttribute('aria-pressed', 'true');
  const region = page.getByRole('group', { name: 'Upper back observation' });
  await region.getByRole('combobox', { name: 'Sensation type' }).selectOption('Custom');
  await region.getByRole('textbox', { name: 'Custom sensation' }).fill('Fluttering');
  await region.getByRole('combobox', { name: 'Intensity (0 to 10)' }).selectOption('0');
  await page.getByRole('button', { name: 'Skip body mapping' }).click();
  await expect(back).toHaveCount(0);
  await page.getByText('Optional movement or stillness reflection', { exact: true }).click();
  await expect(page.getByText('Non-movement option')).toBeVisible();
  await page.getByRole('button', { name: 'Return to body mapping' }).click();
  await expect(region.getByRole('textbox', { name: 'Custom sensation' })).toHaveValue('Fluttering');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('body observation validation distinguishes zero, unrated, and duplicate regions', () => {
  const record = { format: 'body-v1', movement: emptyMovement, observations: [{ ...emptyObservation('Jaw'), intensity: 0 }] };
  expect(bodySchema.parse(record).observations[0].intensity).toBe(0);
  expect(bodySchema.safeParse({ ...record, observations: [...record.observations, emptyObservation('Jaw')] }).success).toBe(false);
  expect(bodySchema.safeParse({ ...record, observations: [{ ...emptyObservation('Head'), intensity: 11 }] }).success).toBe(false);
  expect(bodySchema.safeParse({ ...record, movement: { ...emptyMovement, after: 'Noticed a sound' }, observations: [] }).success).toBe(true);
});
