import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const originalPassword = 'Original-synthetic-password-9';
const newPassword = 'Replacement-synthetic-password-3';
const mail = new URL(process.env.STUDIO_AUTH_TEST_MAIL ?? 'http://127.0.0.1:54324');
if (!['localhost', '127.0.0.1', '[::1]'].includes(mail.hostname)) throw new Error('Auth tests require local Mailpit.');

const prefix = new URL(process.env.STUDIO_AUTH_TEST_URL ?? 'http://localhost:3000').pathname.replace(/\/$/, '');

function route(path: string) {
  return prefix + (prefix && path === '/' ? '' : path);
}

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
  test.setTimeout(240_000);
  const address = 'studio-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/journal'));
  await expect(page).toHaveURL(/\/login$/);
  const origin = new URL(page.url()).origin;
  const exported = await request.get(route('/personal-data'), { maxRedirects: 0 });
  expect(exported.status()).toBe(307);

  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Synthetic Learner');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  const confirmation = await emailLink(request, address, route('/auth/confirm'), origin);
  await page.reload();
  await signIn(page, address, originalPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
  await page.goto(confirmation);
  await expect(page.getByRole('heading', { name: /Welcome back, Synthetic/ })).toBeVisible();
  await expect(page.getByText('Set a goal with a target date this week to see it here.')).toBeVisible();
  for (const label of ['Exercises completed', 'Journal entries', 'Goals completed', 'Products owned']) {
    await expect(page.locator('.metric').filter({ hasText: label }).locator('strong')).toHaveText('0');
  }
  await page.goto(route('/account'));
  await expect(page.getByText(address, { exact: true })).toBeVisible();
  await page.getByLabel('Display name').fill('Renamed Learner');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();
  await page.goto(route('/'));
  await expect(page.getByRole('heading', { name: /Welcome back, Renamed/ })).toBeVisible();
  await expect(page.getByText('Sample content', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Finding My Voice' })).toHaveCount(0);
  await page.goto(route('/workbooks'));
  await expect(page.getByRole('heading', { name: 'The Dancer Mindset' })).toHaveCount(0);
  await page.goto(route('/content-editor'));
  await expect(page.getByRole('heading', { name: 'Workbook content editor' })).toHaveCount(0);

  await page.goto(route('/workbooks/customer-audit-fixture'));
  await page.getByRole('textbox', { name: 'What did you practice?' }).fill('A synthetic workbook answer');
  await page.getByRole('button', { name: 'Complete module' }).click();
  await expect(page.getByText('Module complete', { exact: true })).toBeVisible();
  await page.goto(route('/journal'));
  await page.getByLabel('Title', { exact: true }).first().fill('Synthetic customer journal');
  await page.getByLabel('What’s on your mind?').fill('A private synthetic reflection.');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.goto(route('/goals'));
  await page.getByLabel('Goal', { exact: true }).first().fill('Synthetic customer goal');
  await page.getByRole('button', { name: 'Add goal' }).click();
  await expect(page.getByText('Synthetic customer goal', { exact: true })).toBeVisible();
  await page.goto(route('/account'));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, address, originalPassword);
  await expect(page.getByRole('heading', { name: /Welcome back, Renamed/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic Customer Workbook', level: 2 })).toBeVisible();
  await page.goto(route('/workbooks/customer-audit-fixture'));
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'What did you practice?' })).toHaveValue('A synthetic workbook answer');
  await page.goto(route('/journal'));
  await expect(page.getByText('Synthetic customer journal', { exact: true })).toBeVisible();
  await page.goto(route('/goals'));
  await expect(page.getByText('Synthetic customer goal', { exact: true })).toBeVisible();

  const guest = await browser.newContext();
  try {
    const second = await guest.newPage();
    const secondAddress = 'studio-' + crypto.randomUUID() + '@example.test';
    await second.goto(origin + route('/login'));
    await second.getByRole('button', { name: /create an account/i }).click();
    await second.getByLabel('Your name').fill('Independent Tester');
    await second.getByLabel('Email address').fill(secondAddress);
    await second.getByLabel('Password', { exact: true }).fill(originalPassword);
    await second.getByRole('button', { name: 'Create your account' }).click();
    await expect(second.getByText(/Check your email for a confirmation link/)).toBeVisible();
    await second.goto(await emailLink(request, secondAddress, route('/auth/confirm'), origin));
    await expect(second.getByRole('heading', { name: /Welcome back, Independent/ })).toBeVisible();
    await expect(second.locator('.metric').filter({ hasText: 'Journal entries' }).locator('strong')).toHaveText('0');
    await expect(second.getByText(/workbook module complete/)).toHaveCount(0);
    await second.goto(origin + route('/account'));
    await expect(second.getByText(secondAddress, { exact: true })).toBeVisible();
    await expect(second.getByText(address, { exact: true })).toHaveCount(0);
    await second.goto(origin + route('/journal'));
    await expect(second.getByText('Your saved entries will appear here.')).toBeVisible();
    await second.goto(origin + route('/goals'));
    await expect(second.getByText('Your goals will appear here.')).toBeVisible();
    await second.goto(origin + route('/workbooks/customer-audit-fixture'));
    await expect(second.getByRole('textbox', { name: 'What did you practice?' })).toHaveValue('');
    await expect(second.getByText('0 of 1 modules complete')).toBeVisible();
  } finally {
    await guest.close();
  }

  await page.goto(route('/journal'));
  const journal = page.locator('details').filter({ hasText: 'Synthetic customer journal' });
  await journal.locator('summary').click();
  await journal.getByRole('textbox', { name: 'Entry', exact: true }).fill('An edited private reflection.');
  await journal.getByRole('button', { name: 'Update entry' }).click();
  await expect(journal.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await journal.locator('summary').click();
  await expect(journal.getByRole('textbox', { name: 'Entry', exact: true })).toHaveValue('An edited private reflection.');
  await journal.getByRole('button', { name: 'Delete entry' }).click();
  await expect(page.getByText('Your saved entries will appear here.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your saved entries will appear here.')).toBeVisible();

  await page.goto(route('/goals'));
  const goal = page.locator('details').filter({ hasText: 'Synthetic customer goal' });
  await goal.locator('summary').click();
  await goal.getByLabel('Goal', { exact: true }).fill('Edited synthetic goal');
  await goal.getByRole('button', { name: 'Update goal' }).click();
  const editedGoal = page.locator('details').filter({ hasText: 'Edited synthetic goal' });
  await expect(editedGoal).toBeVisible();
  await page.reload();
  await editedGoal.locator('summary').click();
  await editedGoal.getByRole('button', { name: 'Delete goal' }).click();
  await expect(page.getByText('Your goals will appear here.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your goals will appear here.')).toBeVisible();

  const faultURL = process.env.STUDIO_AUTH_TEST_FAULT_URL;
  if (faultURL) {
    const fault = new URL(faultURL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(fault.hostname)) throw new Error('Fault injection requires a local gateway.');
    expect((await request.post(fault.href, { data: { fail: true } })).ok()).toBeTruthy();
    try {
      await page.goto(route('/'));
      await expect(page.getByRole('heading', { name: 'Your studio couldn’t load.' })).toBeVisible();
      await expect(page.getByText('Sample content', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /Welcome back/ })).toHaveCount(0);
    } finally {
      expect((await request.post(fault.href, { data: { fail: false } })).ok()).toBeTruthy();
    }
    await page.goto(route('/'));
    await expect(page.getByRole('heading', { name: /Welcome back, Renamed/ })).toBeVisible();
  }

  await page.goto(route('/reset-password'));
  await expect(page).toHaveURL(/\/forgot-password\?expired=1$/);
  await page.getByLabel('Email address').fill(address);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  const recovery = await emailLink(request, address, route('/auth/recovery'), origin);
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

  await page.goto(route('/login'));
  if (new URL(page.url()).pathname !== route('/login')) {
    await page.goto(route('/account'));
    await page.getByRole('button', { name: 'Sign out' }).click();
  }
  await signIn(page, address, originalPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
  await signIn(page, address, newPassword);
  await expect(page).toHaveURL(route('/'));
  await page.goto(route('/account'));
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
  await page.goto(route('/goals'));
  await expect(page).toHaveURL(/\/login$/);
});
