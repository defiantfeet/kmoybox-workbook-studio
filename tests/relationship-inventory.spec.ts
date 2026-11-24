import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyRelationship, relationshipDetails, relationshipSchema } from '../lib/becoming/relationships';

test('Relationship Inventory offers private labels and optional reflections and ratings on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/relationship-inventory');
  await expect(page.getByText('Your circle is empty.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Relationship label' }).fill('Book club');
  await page.getByText('Subjective ratings (optional)', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Trust', exact: true }).selectOption('4');
  await page.getByRole('combobox', { name: 'Trust', exact: true }).selectOption('');
  await expect(page.getByRole('combobox', { name: 'Trust', exact: true })).toHaveValue('');
  await page.getByText('Reflection questions (optional)', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Can I express disagreement?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('Relationship Inventory validates ratings and retains intention snapshots', () => {
  const details = { ...emptyRelationship, label: '  A.  ' };
  expect(relationshipDetails.parse(details).label).toBe('A.');
  expect(relationshipDetails.safeParse({ ...details, ratings: { Trust: 0 } }).success).toBe(false);
  expect(relationshipDetails.safeParse({ ...details, ratings: { Trust: 5.5 } }).success).toBe(false);
  const stored = { ...details, format: 'relationship-v1', intention: 'The current intention',
    reviews: [{ date: '2026-11-24', intention: 'A previous intention', note: 'Private review' }] };
  expect(relationshipSchema.parse(stored).reviews[0].intention).toBe('A previous intention');
  expect(relationshipSchema.safeParse({ ...stored, reviews: [{ ...stored.reviews[0], date: '2026-02-30' }] }).success).toBe(false);
});
