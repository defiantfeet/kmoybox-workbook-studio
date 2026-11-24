import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('emergency limitations and crisis support are accessible on mobile and without sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/becoming');
  await expect(page.getByText('The Studio is not monitored for emergencies.')).toBeVisible();
  const link = page.getByRole('link', { name: 'Get support', exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Support and safety' })).toBeVisible();
  await expect(page.getByRole('link', { name: '988', exact: true })).toHaveAttribute('href', /^tel:988/);
  await expect(page.getByRole('link', { name: 'Find a Helpline by country' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});

const moduleSlugs = [
  'identity-mapping', 'values-assessment', 'life-timeline', 'thought-record', 'emotional-wheel',
  'cognitive-reframing', 'inner-critic-dialogue', 'mood-tracker', 'relationship-inventory',
  'social-integration', 'boundary-builder', 'body-awareness-map', 'wheel-of-life',
  'future-self-visualization', 'habit-tracker', 'insights', 'reports', 'onboarding', 'notifications',
];

for (const slug of moduleSlugs) {
  test(`${slug} primary view has no automated WCAG A/AA violations at mobile width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/becoming/' + slug);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([]);
  });
}
