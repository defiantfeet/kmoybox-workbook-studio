import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { compareIdentity, emptyIdentity, identitySchema } from '../lib/becoming/identity';

test('Identity map and list share keyboard-editable nodes and connections', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/becoming/identity-mapping');
  const visual = page.getByRole('group', { name: 'Visual identity map' });
  await expect(visual.getByText('Me', { exact: true })).toBeVisible();
  const add = page.getByRole('button', { name: 'Add node' });
  await add.click();
  await page.getByRole('textbox', { name: 'Node name' }).fill('Artist');
  await page.getByRole('combobox', { name: 'Classification (optional)' }).selectOption('Currently exploring');
  await add.click();
  await page.getByRole('textbox', { name: 'Node name' }).fill('Listener');
  await page.getByRole('combobox', { name: 'Connect to' }).selectOption({ label: 'Artist' });
  await page.getByRole('button', { name: 'Connect nodes' }).click();
  await expect(visual.locator('.identity-line[data-joined="true"]')).toHaveCount(1);
  const axis = visual.getByRole('button', { name: 'Map node 1: Artist' });
  await axis.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Node name' })).toHaveValue('Artist');
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(visual).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Identity nodes' })).toContainText('Currently exploring');
  await page.getByRole('button', { name: 'Disconnect Listener' }).click();
  await expect(page.getByText('This node has no connections.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove node' }).click();
  await expect(page.getByRole('list', { name: 'Identity nodes' })).toContainText('Listener');
  await expect(page.getByRole('list', { name: 'Identity nodes' })).not.toContainText('Artist');
  await page.getByText('Optional reflections', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Who am I when no one is watching?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('Identity comparisons use stable node IDs and reject orphan edges', () => {
  const id = '00000000-0000-4000-8000-000000000601';
  const older = { ...emptyIdentity, nodes: [{ id, label: 'Artist', category: '' as const, classification: '' as const }] };
  const newer = { ...older, nodes: [{ ...older.nodes[0], label: 'Painter' }] };
  expect(compareIdentity(newer, older)).toMatchObject({ added: [], removed: [], changed: [{ after: { label: 'Painter' } }] });
  expect(identitySchema.safeParse({ ...newer, connections: [[id, '00000000-0000-4000-8000-000000000602']] }).success).toBe(false);
});
