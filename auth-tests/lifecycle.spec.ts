import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const originalPassword = 'Original-synthetic-password-9';
const newPassword = 'Replacement-synthetic-password-3';
const mail = new URL(process.env.STUDIO_AUTH_TEST_MAIL ?? 'http://127.0.0.1:54324');
if (!['localhost', '127.0.0.1', '[::1]'].includes(mail.hostname)) throw new Error('Auth tests require local Mailpit.');

async function emailLink(request: APIRequestContext, address: string, part: string, appOrigin: string) {
  let url: string | undefined;
  await expect.poll(async () => {
    const inbox = await (await request.get(new URL('/api/v1/messages', mail).href)).json() as {
      messages?: { ID: string; To: { Address: string }[] }[];
    };
    for (const entry of inbox.messages ?? []) {
      if (!entry.To.some(recipient => recipient.Address === address)) continue;
      const message = await (await request.get(new URL('/api/v1/message/' + entry.ID, mail).href)).json() as { HTML: string };
      const candidate = /href="([^"]+)"/.exec(message.HTML)?.[1];
      if (candidate) {
        const link = new URL(candidate);
        if (link.origin === appOrigin && link.pathname === part && link.searchParams.has('token_hash')) {
          url = link.href;
          return true;
        }
      }
    }
    return false;
  }).toBe(true);
  return url!;
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('confirmation, protected routes, profile, password recovery, and account deletion', async ({ page, request, browser }) => {
  const address = 'studio-' + crypto.randomUUID() + '@example.test';
  await page.goto('/journal');
  await expect(page).toHaveURL(/\/login$/);
  const origin = new URL(page.url()).origin;
  const exported = await request.get('/personal-data', { maxRedirects: 0 });
  expect(exported.status()).toBe(307);

  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Synthetic Learner');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  const confirmation = await emailLink(request, address, '/auth/confirm', origin);
  await page.reload();
  await signIn(page, address, originalPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
  await page.goto(confirmation);
  await expect(page.getByRole('heading', { name: /Welcome back, Synthetic/ })).toBeVisible();
  await page.goto('/account');
  await page.getByLabel('Display name').fill('Renamed Learner');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome back, Renamed/ })).toBeVisible();

  await page.goto('/reset-password');
  await expect(page).toHaveURL(/\/forgot-password\?expired=1$/);
  await page.getByLabel('Email address').fill(address);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  const recovery = await emailLink(request, address, '/auth/recovery', origin);
  const separate = await browser.newContext();
  try {
    const reset = await separate.newPage();
    await reset.goto(recovery);
    await expect(reset.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    const cookies = await separate.cookies();
    expect(cookies.find(cookie => cookie.name === 'studio-recovery')?.httpOnly).toBe(true);
    expect(cookies.some(cookie => cookie.name.includes('-auth-token') && cookie.httpOnly)).toBe(true);
    await reset.getByLabel('New password', { exact: true }).fill(newPassword);
    await reset.getByLabel('Confirm new password').fill(newPassword);
    await reset.getByRole('button', { name: 'Update password' }).click();
    await expect(reset.getByText(/Password updated/)).toBeVisible();
    await reset.goto(recovery);
    await expect(reset).toHaveURL(/\/forgot-password\?expired=1$/);
  } finally {
    await separate.close();
  }

  await page.goto('/login');
  if (new URL(page.url()).pathname !== '/login') {
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out' }).click();
  }
  await signIn(page, address, originalPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
  await signIn(page, address, newPassword);
  await expect(page).toHaveURL('/');
  await page.goto('/account');
  await page.getByText('Delete my account', { exact: true }).click();
  await page.getByLabel('Current password').fill(originalPassword);
  await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'current password could not be verified' })).toBeVisible();
  await page.getByLabel('Current password').fill(newPassword);
  await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page.getByText('Your account was deleted.')).toBeVisible();
  await signIn(page, address, newPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
  await page.goto('/goals');
  await expect(page).toHaveURL(/\/login$/);
});
