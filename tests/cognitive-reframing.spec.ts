import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { emptyReframe, fillReframeBlanks, reframeSchema, thoughtToReframe } from '../lib/becoming/reframing';
import { emptyThought } from '../lib/becoming/thought-record';

test('Cognitive Reframing supports keyboard navigation and a neutral before-and-after review', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/cognitive-reframing');
  await page.getByRole('textbox', { name: 'Thought or belief' }).fill('I may need more information.');
  await page.getByRole('spinbutton', { name: /Intensity before reflection/ }).fill('40');
  await page.getByText('Optional perspective-taking prompts').click();
  await expect(page.getByText('Could the environment, rather than my thinking, be the primary problem?')).toBeVisible();
  const next = page.getByRole('button', { name: 'Next step' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Step 2 of 5/ })).toBeFocused();
  await page.getByRole('textbox', { name: 'What did you directly observe?' }).fill('A message went unanswered.');
  await next.click();
  await expect(page.getByRole('textbox', { name: 'Evidence that may conflict with the thought' })).toBeVisible();
  await next.click();
  await page.getByRole('textbox', { name: 'Balanced alternative perspective' }).fill('I can ask once and leave room for uncertainty.');
  await next.click();
  await page.getByRole('spinbutton', { name: /Intensity after reflection/ }).fill('40');
  await expect(page.getByRole('article', { name: 'Before reframing' })).toContainText('40 / 100');
  await expect(page.getByRole('article', { name: 'After reframing' })).toContainText('40 / 100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('Thought Record import fills blanks without replacing an existing zero or text', () => {
  const current = { ...emptyReframe, before: 0, text: { thought: 'Keep my wording' } };
  const imported = thoughtToReframe({ ...emptyThought, before: 70, after: 30, emotions: ['Uneasy'],
    text: { automatic: 'Earlier thought', situation: 'Earlier situation' } });
  const merged = fillReframeBlanks(current, imported);
  expect(merged).toMatchObject({ before: 0, after: 30, beforeEmotions: ['Uneasy'],
    text: { thought: 'Keep my wording', situation: 'Earlier situation' } });
  expect(reframeSchema.safeParse({ ...merged, after: 101 }).success).toBe(false);
});
