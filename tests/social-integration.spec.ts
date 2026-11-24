import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { socialSections, socialTitle } from '../lib/becoming/social';

test('Beyond the Box supports mobile and keyboard navigation with optional practice and mapping', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/social-integration');
  await expect(page.getByRole('heading', { name: socialTitle })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Social Integration sections' });
  await expect(nav.getByRole('link')).toHaveCount(Object.keys(socialSections).length);
  const map = nav.getByRole('link', { name: 'Social Ecosystem Map' });
  await map.focus();
  await page.keyboard.press('Enter');
  await expect(map).toHaveAttribute('aria-current', 'page');
  const circle = page.getByRole('button', { name: 'Community', exact: true });
  await circle.focus();
  await page.keyboard.press('Space');
  await expect(circle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'Circle name' }).fill('Places to make things');
  await expect(page.getByRole('button', { name: 'Places to make things' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  await nav.getByRole('link', { name: 'Communication Practice' }).click();
  await page.getByRole('combobox', { name: 'Practice scenario' }).selectOption({ label: 'Declining invitations' });
  await page.getByRole('button', { name: 'Use example as a starting point' }).click();
  const response = page.getByRole('textbox', { name: 'My response' });
  await expect(response).toHaveValue(/going to sit this one out/);
  await response.fill('I need some quiet time. Thanks for inviting me.');
  await expect(response).toHaveValue(/quiet time/);
});
