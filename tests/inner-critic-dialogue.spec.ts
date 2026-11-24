import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { dialogueSchema, emptyDialogue, readDialogue } from '../lib/becoming/inner-critic';

test('Inner Critic Dialogue supports repeatable exchanges and a keyboard-accessible collection', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/inner-critic-dialogue');
  const first = page.getByRole('region', { name: 'Exchange 1' });
  await expect(first.getByRole('heading', { name: 'The Inner Critic' })).toBeVisible();
  await expect(first.getByRole('heading', { name: 'My Reflective and Compassionate Voice' })).toBeVisible();
  await expect(first.getByRole('textbox')).toHaveCount(8);
  await first.getByRole('textbox', { name: 'What would a compassionate and realistic response sound like?' }).fill('I can take this at my own pace.');
  await first.getByRole('button', { name: 'Use response in collection' }).click();
  const statement = page.getByRole('textbox', { name: 'Supportive statement' });
  await expect(statement).toBeFocused();
  await expect(statement).toHaveValue('I can take this at my own pace.');
  const add = page.getByRole('button', { name: 'Add exchange' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Exchange 2' })).toBeVisible();
  await page.getByText('Choose themes (optional)', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Professional performance' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('dialogue validation preserves older drafts and rejects duplicate exchanges', () => {
  const legacy = readDialogue({ '0': 'An older thought', '2': 'An older response' });
  expect(legacy.exchanges[0]).toMatchObject({ message: 'An older thought', response: 'An older response' });
  expect(dialogueSchema.safeParse({ ...emptyDialogue, exchanges: [...emptyDialogue.exchanges, ...emptyDialogue.exchanges] }).success).toBe(false);
});
