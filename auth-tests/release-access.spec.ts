import { expect, test } from '@playwright/test';

const prefix = new URL(process.env.STUDIO_AUTH_TEST_URL ?? 'http://localhost:3000').pathname.replace(/\/$/, '');

test('public support works without authentication while private Growth endpoints fail closed', async ({ page, request }) => {
  const support = await page.goto(prefix + '/support');
  expect(support?.status()).toBe(200);
  await expect(page.getByText('The Studio is not monitored for emergencies.')).toBeVisible();
  for (const path of ['/becoming', '/becoming/insights', '/becoming/reports', '/becoming/notifications', '/content-editor/personal-growth']) {
    const response = await request.get(prefix + path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers().location).toContain('/login');
  }
  const id = '00000000-0000-4000-8000-000000000000';
  for (const path of ['/personal-data', '/becoming/mood-tracker/export', '/becoming/wheel-of-life/export', '/becoming/reports/' + id + '/pdf',
    '/becoming/life-timeline/image/' + id]) {
    const response = await request.get(prefix + path, { maxRedirects: 0 });
    expect([307, 401, 404], path).toContain(response.status());
  }
  for (const path of ['/becoming/notifications/poll', '/becoming/engagement']) {
    expect((await request.post(prefix + path, { data: { module: 'mood-tracker' } })).status(), path).toBe(401);
    expect((await request.post(prefix + path, {
      data: { module: 'mood-tracker' }, headers: { 'Sec-Fetch-Site': 'cross-site' },
    })).status(), path).toBe(403);
  }
});
