import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = ['/', '/workbooks', '/journal', '/goals', '/account', '/purchases'];

test('core pages have no automated WCAG A/AA violations', async ({ page }) => {
  for (const path of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags([
      'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa',
    ]).analyze();
    expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), path).toEqual([]);
  }
});

test('core pages fit narrow mobile and tablet displays', async ({ page }) => {
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 840 });
    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflows, width + 'px at ' + path).toBe(false);
    }
  }
});

test('journal keeps unsaved text visible during a failed autosave and saves it on retry', async ({ page }) => {
  await page.goto('/journal');
  await page.route('**/journal', request => {
    if (request.request().method() === 'POST') return request.abort();
    return request.continue();
  });
  const composer = page.locator('#new-entry');
  await composer.getByLabel('Title', { exact: true }).fill('A draft to recover');
  const reflection = composer.getByRole('textbox', { name: 'What’s on your mind?' });
  await reflection.fill('Keep this text while the connection is down.');
  await expect(composer.getByRole('alert')).toContainText('Could not save');
  await expect(reflection).toHaveValue('Keep this text while the connection is down.');
  await page.unroute('**/journal');
  await composer.getByRole('button', { name: 'Save entry' }).click();
  await expect(composer.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await expect(page.locator('summary').filter({ hasText: 'A draft to recover' })).toBeVisible();
});

test('unknown routes return 404 and the unconfigured webhook fails closed', async ({ request }) => {
  expect((await request.get('/missing-studio-page')).status()).toBe(404);
  expect((await request.post('/stripe/webhook', { data: {} })).status()).toBe(503);
});
