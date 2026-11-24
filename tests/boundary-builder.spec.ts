import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { boundarySchema, emptyBoundary, privatePlanning } from '../lib/becoming/boundaries';

test('Boundary Builder provides editable templates and a private planning path', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/boundary-builder');
  await page.getByRole('combobox', { name: 'Category (optional)' }).selectOption('Personal privacy');
  await page.getByRole('combobox', { name: 'Boundary group' }).selectOption('Conditional or negotiable');
  const template = page.getByRole('button', { name: 'I would prefer…', exact: true });
  await template.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Private script' })).toHaveValue('I would prefer…');
  await page.getByRole('textbox', { name: 'Private script' }).fill('I would prefer some uninterrupted time.');
  const safety = page.getByRole('combobox', { name: /Does it feel safe/ });
  await safety.selectOption('unsafe');
  await expect(page.getByText('Give yourself room to plan privately.')).toBeVisible();
  await expect(template).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Action within my control' })).toBeVisible();
  await safety.selectOption('uncertain');
  await expect(template).toHaveCount(0);
  await safety.selectOption('safe');
  await expect(page.getByRole('textbox', { name: 'Private script' })).toHaveValue('I would prefer some uninterrupted time.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('Boundary Builder validates reminder dates and chooses private planning when safety is uncertain', () => {
  expect(boundarySchema.safeParse({ ...emptyBoundary, followUpDate: '2026-02-30' }).success).toBe(false);
  expect(boundarySchema.safeParse({ ...emptyBoundary, zone: 'Not acceptable', followUpDate: '2026-02-28' }).success).toBe(true);
  expect(privatePlanning({ safety: 'uncertain' })).toBe(true);
});
