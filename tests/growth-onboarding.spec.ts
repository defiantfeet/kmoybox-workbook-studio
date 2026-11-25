import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyOnboarding, onboardingSchema, startingPlan } from '../lib/becoming/onboarding';

test('optional onboarding offers a live plan and preserves access to every module', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming');
  await page.getByRole('link', { name: 'Personalize my starting plan' }).click();
  await expect(page.getByRole('heading', { name: 'Personalize The Becoming Studio' })).toBeVisible();
  const topics = page.getByRole('group', { name: 'Topics of interest' });
  for (const name of ['Emotional awareness', 'Identity and self-discovery', 'Body awareness', 'Future goals']) {
    const checkbox = topics.getByRole('checkbox', { name, exact: true });
    await checkbox.focus();
    await page.keyboard.press('Space');
  }
  await page.getByText('Optional reflection and accessibility preferences', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Preferred activity duration' }).selectOption('5 minutes or less');
  await page.getByRole('checkbox', { name: 'Written prompts' }).check();
  const starting = page.getByRole('region', { name: 'Your starting plan' });
  await expect(starting.getByRole('listitem')).toHaveCount(3);
  await expect(starting.getByRole('link', { name: 'Mood Tracker' })).toBeVisible();
  await expect(starting.getByText(/region checklist/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a custom goal' }).click();
  await page.getByRole('textbox', { name: 'Custom goal 1' }).fill('Keep more time for drawing');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Skip onboarding' }).click();
  await expect(page.getByRole('region', { name: 'Explore growth modules' }).getByRole('link')).toHaveCount(15);
});

test('recommendations follow chosen topics with a three-tool ceiling', () => {
  expect(startingPlan(emptyOnboarding)).toEqual([]);
  expect(startingPlan({ ...emptyOnboarding, goals: ['Make space to rest'] }).map(item => item.slug)).toEqual(['future-self-visualization']);
  expect(startingPlan({ ...emptyOnboarding, topics: ['emotions', 'belonging', 'habits', 'identity'],
    frequency: 'Daily', participation: 'Mostly on my own' }).map(item => item.slug)).toEqual(['mood-tracker', 'social-integration', 'habit-tracker']);
  expect(onboardingSchema.safeParse({ ...emptyOnboarding, times: ['08:00', '08:00'] }).success).toBe(false);
});
