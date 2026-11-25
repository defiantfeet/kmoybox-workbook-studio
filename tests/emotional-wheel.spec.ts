import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emotionList, emotionVocabulary } from '../lib/becoming/emotions';

test('the three-ring wheel supports keyboard, search, a list, and custom labels', async ({ page }) => {
  const renderingErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) renderingErrors.push(message.text());
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/emotional-wheel');
  const wheel = page.getByRole('group', { name: 'Three-ring emotion wheel' });
  const family = wheel.getByRole('button', { name: 'Broad category: Complexity' });
  await family.focus();
  await page.keyboard.press('Enter');
  await wheel.getByRole('button', { name: 'Specific emotion: Uncertain' }).focus();
  await page.keyboard.press('Enter');
  const phrase = wheel.getByRole('button', { name: 'Nuanced emotion: Hard to name' });
  const box = await wheel.boundingBox();
  expect(box).not.toBeNull();
  // Point at the center of the third painted segment on the five-part outer ring.
  const angle = 2 * Math.PI * 2 / 5 - Math.PI / 2;
  await page.mouse.click(
    box!.x + box!.width * (215 + 178 * Math.cos(angle)) / 430,
    box!.y + box!.height * (215 + 178 * Math.sin(angle)) / 430,
  );
  await expect(phrase).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(wheel).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: 'Search emotion vocabulary' });
  await search.fill('Neutral');
  await page.getByRole('checkbox', { name: /^Neutral(?:\s|$)/ }).check();
  await page.getByRole('textbox', { name: 'Custom emotion' }).fill('Quietly determined');
  await page.getByRole('button', { name: 'Add custom emotion' }).click();
  const selected = page.getByRole('list', { name: 'Selected emotions' });
  for (const label of ['Hard to name', 'Neutral', 'Quietly determined']) await expect(selected).toContainText(label);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect(renderingErrors).toEqual([]);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('the vocabulary is original, deep, and validated independently of custom labels', () => {
  expect(new Set(emotionVocabulary.map(item => item.label.toLowerCase())).size).toBeGreaterThanOrEqual(60);
  expect(emotionList.safeParse(['Mixed', 'Neutral', 'Uncertain', 'Quiet resolve']).success).toBe(true);
  expect(emotionList.safeParse(['Mixed', 'mixed']).success).toBe(false);
});
