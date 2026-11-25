import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { categories } from '../lib/becoming/catalog';
import { socialTitle } from '../lib/becoming/social';

test('Personal Growth navigation opens every module in the Studio shell', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Studio navigation' });
  await nav.getByRole('link', { name: 'Personal Growth' }).click();
  await expect(page).toHaveURL(/\/becoming$/);
  await expect(nav.getByRole('link', { name: 'Personal Growth' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'The Becoming Studio' })).toBeVisible();
  await expect(page.getByText('Exercises you mark complete will show up here.')).toBeVisible();
  await expect(page.getByText('Save an exercise to begin your progress history.')).toBeVisible();

  const directory = page.getByRole('region', { name: 'Explore growth modules' });
  await expect(directory.getByRole('link')).toHaveCount(15);
  for (const category of categories) {
    await expect(directory.getByRole('heading', { name: category.title, exact: true })).toBeVisible();
    for (const module of category.modules) {
      await directory.getByRole('link', { name: module.title, exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/becoming/' + module.slug + '$'));
      await expect(page.getByRole('heading', { name: module.slug === 'social-integration' ? socialTitle : module.title, level: 1 })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Personal Growth' })).toHaveAttribute('aria-current', 'page');
      await page.getByRole('link', { name: 'Back to Personal Growth' }).click();
    }
  }
  await nav.getByRole('link', { name: 'Workbooks' }).click();
  await expect(page.getByRole('heading', { name: 'Workbooks', exact: true })).toBeVisible();
});

test('Personal Growth dashboard fits mobile, tablet, and desktop and supports keyboard navigation', async ({ page }) => {
  await page.goto('/becoming');
  for (const width of [360, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  const explore = page.getByRole('link', { name: 'Explore modules' });
  await explore.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#growth-modules$/);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
