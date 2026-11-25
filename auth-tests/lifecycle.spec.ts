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
  test.setTimeout(420_000);
  const address = 'studio-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/journal'));
  await expect(page).toHaveURL(/\/login$/);
  for (const path of ['/becoming', '/becoming/wheel-of-life']) {
    await page.goto(route(path));
    await expect(page).toHaveURL(/\/login$/);
  }
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
  const preview = await request.get(confirmation);
  expect(preview.status()).toBe(200);
  expect(preview.headers()['set-cookie']).toBeUndefined();
  const crossSite = await request.post(route('/auth/confirm'), {
    headers: { origin: 'https://example.test', 'sec-fetch-site': 'cross-site' },
    form: { token_hash: new URL(confirmation).searchParams.get('token_hash')! },
    maxRedirects: 0,
  });
  expect(crossSite.status()).toBe(303);
  expect(crossSite.headers().location).toBe(route('/login?confirmation=failed'));
  await page.goto(confirmation);
  await page.getByRole('button', { name: 'Confirm email' }).click();
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
  await page.goto(route('/content-editor/personal-growth'));
  await expect(page.getByRole('heading', { name: 'Personal Growth Content Manager' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Content library' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish now' })).toHaveCount(0);

  await page.goto(route('/becoming'));
  await expect(page.getByText('Welcome, Renamed', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Timezone' }).selectOption('Pacific/Kiritimati');
  await page.getByRole('button', { name: 'Save timezone' }).click();
  await expect(page.getByText('Timezone saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Timezone' })).toHaveValue('Pacific/Kiritimati');
  const daily = page.getByRole('region', { name: 'Daily emotional check-in' });
  await daily.getByText('Check in for Daily emotional check-in', { exact: true }).click();
  await daily.getByRole('combobox', { name: 'Mood', exact: true }).selectOption('Calm');
  await daily.getByLabel('Note (optional)').fill('A synthetic mood note');
  await daily.getByRole('button', { name: 'Save check-in' }).click();
  await expect(daily.getByText('Today: Calm')).toBeVisible();
  const growthExport = await (await page.request.get(route('/personal-data'))).json();
  expect(growthExport.growthCheckIns[0].timezone).toBe('Pacific/Kiritimati');
  expect(growthExport.growthCheckIns[0].local_date).toBe(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()));
  await page.getByRole('link', { name: 'Boundary Builder', exact: true }).click();
  await page.getByLabel('Situation or relationship').fill('A synthetic boundary');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Boundary draft saved.' })).toBeVisible();
  await page.goto(route('/becoming'));
  await page.getByRole('link', { name: 'Resume Boundary Builder' }).click();
  await expect(page.getByLabel('Situation or relationship')).toHaveValue('A synthetic boundary');
  await page.getByLabel('Boundary group').selectOption('Conditional or negotiable');
  await page.getByLabel('Desired boundary').fill('An hour');
  await page.getByLabel('Private script').fill('I have an hour available.');
  await page.getByRole('button', { name: 'Save boundary' }).click();
  await expect(page.getByText('Boundary saved.', { exact: true })).toBeVisible();
  await page.goto(route('/becoming'));
  await expect(page.getByRole('region', { name: 'Progress history' }).getByText('Boundary saved', { exact: false })).toBeVisible();
  await page.getByLabel('What went well?').fill('A synthetic weekly reflection');
  await page.getByRole('button', { name: 'Save reflection' }).click();
  await expect(page.getByText('Reflection saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open Habit Tracker' }).click();
  await page.getByLabel('New habit').fill('Read a page');
  await page.getByRole('button', { name: 'Add habit' }).click();
  const todayHabit = page.getByRole('button', { name: /Read a page,/ }).filter({ visible: true }).and(page.locator(':enabled'));
  await todayHabit.click();
  await expect(todayHabit).toHaveAttribute('aria-pressed', 'true');
  await page.goto(route('/becoming'));
  await expect(page.getByText('1 of 1 complete today')).toBeVisible();
  await expect(page.getByLabel('What went well?')).toHaveValue('A synthetic weekly reflection');

  await page.goto(route('/becoming/wheel-of-life'));
  await page.getByRole('button', { name: 'Complete assessment' }).click();
  await expect(page.getByText('Rate every domain before completing your assessment.')).toBeVisible();
  const career = page.getByRole('group', { name: '1. Career and education', exact: true });
  await career.getByRole('combobox').selectOption('7');
  await career.getByRole('textbox', { name: 'Optional reflection' }).fill('Synthetic wheel reflection');
  await career.getByRole('checkbox', { name: 'Make this a priority' }).check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Assessment draft saved.')).toBeVisible();
  await page.reload();
  await expect(career.getByRole('combobox')).toHaveValue('7');
  await expect(career.getByRole('textbox', { name: 'Optional reflection' })).toHaveValue('Synthetic wheel reflection');
  await expect(career.getByRole('checkbox', { name: 'Make this a priority' })).toBeChecked();
  const assessment = page.getByRole('region', { name: 'Your assessment' });
  for (const rating of await assessment.getByRole('combobox').all()) await rating.selectOption('7');
  await page.getByRole('button', { name: 'Complete assessment' }).click();
  await expect(page.getByText('Assessment completed.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add domain' }).click();
  await page.getByRole('group', { name: '9. New domain' }).getByRole('textbox', { name: 'Domain name' }).fill('Music practice');
  for (const rating of await assessment.getByRole('combobox').all()) await rating.selectOption('9');
  await page.getByRole('button', { name: 'Complete assessment' }).click();
  const comparison = page.getByRole('table', { name: 'Saved domain ratings' });
  await expect(comparison.getByRole('row', { name: /Career and education/ })).toContainText('+2');
  await expect(comparison.getByRole('row', { name: /Music practice/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Trend period' }).selectOption('quarter');
  await expect(page.getByRole('table', { name: /Average ratings.*Q/ })).toBeVisible();
  const wheelExport = await page.request.get(route('/becoming/wheel-of-life/export'));
  expect(wheelExport.ok()).toBe(true);
  expect(wheelExport.headers()['cache-control']).toContain('no-store');
  const wheelData = await wheelExport.json();
  expect(wheelData.assessments).toHaveLength(2);
  expect(wheelData.assessments[1].domains[0]).toMatchObject({ note: 'Synthetic wheel reflection', priority: true });
  await page.getByRole('button', { name: 'Enable monthly reminder' }).click();
  await expect(page.getByRole('button', { name: 'Disable monthly reminder' })).toBeVisible();
  await page.getByLabel('Specific next step').fill('Plan a weekly practice session');
  await page.getByRole('button', { name: 'Add to Growth Goals' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.goto(route('/becoming'));
  await expect(page.getByRole('region', { name: 'Personal growth goals' }).getByText('Plan a weekly practice session')).toBeVisible();
  await page.goto(route('/goals'));
  const wheelGoal = page.locator('details').filter({ hasText: 'Plan a weekly practice session' });
  await wheelGoal.locator('summary').click();
  await wheelGoal.getByRole('button', { name: 'Delete goal' }).click();
  await expect(wheelGoal).toHaveCount(0);

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
    await second.getByRole('button', { name: 'Confirm email' }).click();
    await expect(second.getByRole('heading', { name: /Welcome back, Independent/ })).toBeVisible();
    await expect(second.locator('.metric').filter({ hasText: 'Journal entries' }).locator('strong')).toHaveText('0');
    await expect(second.getByText(/workbook module complete/)).toHaveCount(0);
    await second.goto(origin + route('/becoming'));
    await expect(second.getByText('No check-in yet today.')).toHaveCount(5);
    await expect(second.getByText('Save an exercise to begin your progress history.')).toBeVisible();
    await expect(second.getByLabel('What went well?')).toHaveValue('');
    const secondWheel = await (await second.request.get(origin + route('/becoming/wheel-of-life/export'))).json();
    expect(secondWheel.assessments).toEqual([]);
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
  await journal.getByRole('textbox', { name: 'Entry', exact: true }).fill('<b>Audit plain-text reflection</b>');
  await journal.getByRole('button', { name: 'Update entry' }).click();
  await expect(journal.getByRole('status')).toHaveText('Saved.');
  await page.reload();
  await journal.locator('summary').click();
  await expect(journal.getByRole('textbox', { name: 'Entry', exact: true })).toHaveValue('<b>Audit plain-text reflection</b>');
  await expect(journal.locator('b').filter({ hasText: 'Audit plain-text reflection' })).toHaveCount(0);
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
  expect((await request.get(recovery)).status()).toBe(200);
  const separate = await browser.newContext();
  try {
    const reset = await separate.newPage();
    await reset.goto(recovery);
    await reset.getByRole('button', { name: 'Continue to password reset' }).click();
    await expect(reset.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    const cookies = await separate.cookies();
    expect(cookies.find(cookie => cookie.name === 'studio-recovery')?.httpOnly).toBe(true);
    expect(cookies.some(cookie => cookie.name.includes('-auth-token') && cookie.httpOnly)).toBe(true);
    await reset.getByLabel('New password', { exact: true }).fill(newPassword);
    await reset.getByLabel('Confirm new password').fill(newPassword);
    await reset.getByRole('button', { name: 'Update password' }).click();
    await expect(reset.getByText(/Password updated/)).toBeVisible();
    await reset.goto(recovery);
    await reset.getByRole('button', { name: 'Continue to password reset' }).click();
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


test('Relationship Inventory, Values Assessment, Identity Mapping, Boundary Builder, and Inner Critic Dialogue connect private work', async ({ page, request }) => {
  test.setTimeout(300_000);
  const address = 'studio-values-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Values Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Values/ })).toBeVisible();

  await page.goto(route('/becoming/values-assessment'));
  const valuesNext = page.getByRole('button', { name: 'Next stage' });
  await valuesNext.click();
  for (const choice of (await page.getByRole('checkbox').all()).slice(0, 10)) await choice.check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Values draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/10 of 15 selected/)).toBeVisible();
  await valuesNext.click();
  for (const choice of await page.getByRole('checkbox').all()) await choice.check();
  await valuesNext.click();
  for (const choice of (await page.getByRole('checkbox').all()).slice(0, 5)) await choice.check();
  await valuesNext.click();
  await valuesNext.click();
  const kindnessValues = page.getByRole('group', { name: '1. Kindness' });
  await kindnessValues.getByRole('textbox', { name: 'What is one action I can take this week?' }).fill('Invite a friend to walk');
  await page.getByRole('textbox', { name: 'Your values statement' }).fill('A synthetic statement about kindness.');
  await page.getByRole('button', { name: 'Complete assessment' }).click();
  await expect(page.getByText('Values assessment completed.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('A synthetic statement about kindness.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Practice type' }).selectOption('social');
  await expect(page.getByRole('textbox', { name: 'Small next step' })).toHaveValue('Invite a friend to walk');
  await page.getByRole('button', { name: 'Connect practice' }).click();
  await expect(page.getByText('Practice connected.')).toBeVisible();
  const valuesExport = await (await page.request.get(route('/personal-data'))).json();
  expect(valuesExport.valuesPractices).toHaveLength(1);
  await page.getByRole('region', { name: 'Put a core value into practice' }).getByRole('link', { name: 'Social Integration' }).click();
  await expect(page.getByRole('textbox', { name: 'What small action could you take there?' })).toHaveValue('Invite a friend to walk');

  await page.goto(route('/becoming/identity-mapping'));
  await page.getByRole('combobox', { name: 'Core value' }).selectOption({ label: 'Kindness' });
  await page.getByRole('button', { name: 'Add value as a node' }).click();
  await expect(page.getByRole('textbox', { name: 'Node name' })).toHaveValue('Kindness');
  await expect(page.getByRole('combobox', { name: 'Category (optional)' })).toHaveValue('Personal values');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Identity draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Node name' })).toHaveValue('Kindness');
  await page.getByRole('button', { name: 'Save dated version' }).click();
  await expect(page.getByText('Dated version saved.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Node name' }).fill('Kindness in action');
  await page.getByRole('button', { name: 'Save dated version' }).click();
  await expect(page.getByRole('heading', { name: 'Changes in selected version' })).toBeVisible();
  await expect(page.getByText(/Kindness · Personal values → Kindness in action · Personal values/)).toBeVisible();
  await page.getByRole('textbox', { name: 'What situation would you like to set a boundary around?' }).fill('Keep one evening free.');
  await page.getByRole('button', { name: 'Create practice draft' }).click();
  await expect(page.getByText(/Practice draft saved/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Related exercise' }).selectOption('social');
  await page.getByRole('textbox', { name: 'What small action might help you feel connected?' }).fill('Do not overwrite the earlier plan.');
  await page.getByRole('button', { name: 'Create practice draft' }).click();
  await expect(page.getByText(/already has saved work/)).toBeVisible();
  await page.getByRole('link', { name: 'Open Social Integration' }).click();
  await expect(page.getByRole('textbox', { name: 'What small action could you take there?' })).toHaveValue('Invite a friend to walk');

  await page.goto(route('/becoming/relationship-inventory'));
  await page.getByRole('textbox', { name: 'Relationship label' }).fill('A. B.');
  await page.getByRole('combobox', { name: 'Category (optional)' }).selectOption('Friends');
  await page.getByRole('combobox', { name: 'Closeness (optional)' }).selectOption('Inner circle');
  await page.getByText('Subjective ratings (optional)', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Trust', exact: true }).selectOption('3');
  await page.getByText('Reflection questions (optional)', { exact: true }).click();
  await page.getByRole('textbox', { name: 'What boundaries might be helpful?' }).fill('More space on weekday evenings.');
  await page.getByRole('textbox', { name: 'Relationship intention (optional)' }).fill('Make time for a walk.');
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(page.getByText('Relationship saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'A. B.', exact: true })).toBeVisible();
  await page.getByText('Subjective ratings (optional)', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Trust', exact: true })).toHaveValue('3');
  await expect(page.getByRole('combobox', { name: 'Respect', exact: true })).toHaveValue('');
  const inner = page.getByRole('button', { name: 'Inner circle, 1 connection', exact: true });
  await inner.focus();
  await page.keyboard.press('Enter');
  await expect(inner).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: 'Show closeness rings' }).uncheck();
  await expect(inner).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'A. B.', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'What have you noticed since setting this intention?' }).fill('A walk made it easier to talk.');
  await page.getByRole('button', { name: 'Save intention review' }).click();
  await expect(page.getByText('Intention review saved.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Relationship intention (optional)' }).fill('Ask about a weekend walk.');
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(page.getByText('Relationship saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Intention reviews' }).getByText('Make time for a walk.', { exact: false })).toBeVisible();
  await expect(page.getByText('A walk made it easier to talk.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add another relationship' }).click();
  await expect(page.getByRole('heading', { name: 'Add a relationship' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Relationship label' }).fill('Reading group');
  await page.getByRole('button', { name: 'Save relationship', exact: true }).click();
  await expect(page.getByText('Relationship saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'A. B.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unplaced', exact: true }).click();
  await expect(page.getByRole('link', { name: 'A. B.', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reading group', exact: true })).toBeVisible();

  await page.goto(route('/becoming/boundary-builder'));
  const situation = page.getByRole('textbox', { name: 'Situation or relationship' });
  await expect(situation).toHaveValue('Keep one evening free.');
  await page.getByText('Link a Relationship Inventory entry', { exact: true }).click();
  const boundarySource = page.getByRole('option', { name: /^A\. B\. ·/ });
  await expect(boundarySource).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Relationship Inventory entry' }).selectOption({ value: await boundarySource.getAttribute('value') ?? '' });
  await expect(page.getByRole('button', { name: 'Link relationship context' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I want to link the selected entry.' }).check();
  await page.getByRole('button', { name: 'Link relationship context' }).click();
  await expect(page.getByText('Relationship Inventory entry linked.', { exact: false })).toBeVisible();
  await expect(situation).toHaveValue('Keep one evening free.');
  await page.getByRole('combobox', { name: 'Choose a value from your assessment' }).selectOption('Kindness');
  await page.getByRole('combobox', { name: 'Category (optional)' }).selectOption('Time');
  await page.getByRole('combobox', { name: 'Boundary group' }).selectOption('Conditional or negotiable');
  await page.getByRole('combobox', { name: /Does it feel safe/ }).selectOption('unsafe');
  await page.getByRole('textbox', { name: 'Action within my control' }).fill('Keep my notes private while I consider options.');
  await page.getByLabel('Follow-up reminder date (optional)').fill('2020-01-01');
  await page.getByRole('button', { name: 'Save boundary' }).click();
  await expect(page.getByText('Boundary saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Relevant core value' })).toHaveValue('Kindness');
  await expect(page.getByRole('button', { name: 'I need…', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'What did you notice or do privately?' }).fill('I reflected privately.');
  await page.getByRole('button', { name: 'Save practice note' }).click();
  await expect(page.getByText('Practice note saved.', { exact: true })).toBeVisible();
  const boundaryExport = await (await page.request.get(route('/personal-data'))).json();
  expect(boundaryExport.boundaryPracticeEntries).toHaveLength(1);
  await page.goto(route('/becoming'));
  await expect(page.getByRole('heading', { name: 'Boundary follow-up reminder' })).toBeVisible();
  await page.getByRole('link', { name: 'Review boundary follow-ups' }).click();
  await expect(page.getByRole('heading', { name: 'Conditional or negotiable', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Keep one evening free.', exact: true }).click();
  await page.getByRole('button', { name: 'Clear reminder date' }).click();
  await page.getByRole('button', { name: 'Save boundary' }).click();
  await expect(page.getByText('Follow-up due', { exact: false })).toHaveCount(0);

  await page.goto(route('/becoming/inner-critic-dialogue'));
  const firstExchange = page.getByRole('region', { name: 'Exchange 1', exact: true });
  await firstExchange.getByRole('textbox', { name: 'What am I telling myself?' }).fill('I should finish everything today.');
  await firstExchange.getByRole('textbox', { name: 'What would a compassionate and realistic response sound like?' }).fill('I can choose one task and make time to pause.');
  await firstExchange.getByRole('button', { name: 'Use response in collection' }).click();
  await page.getByRole('button', { name: 'Save supportive statement' }).click();
  await expect(page.getByText('Supportive statement saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add exchange' }).click();
  await page.getByRole('region', { name: 'Exchange 2', exact: true }).getByRole('textbox', { name: 'What action would support me now?' }).fill('Take a ten-minute break.');
  await page.getByRole('combobox', { name: 'Core value' }).selectOption({ label: 'Kindness' });
  await page.getByRole('button', { name: 'Attach value' }).click();
  await page.getByRole('combobox', { name: 'Identity element' }).selectOption({ label: 'Kindness in action' });
  await page.getByRole('button', { name: 'Attach identity element' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Dialogue draft saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Exchange 2', exact: true }).getByRole('textbox', { name: 'What action would support me now?' })).toHaveValue('Take a ten-minute break.');
  await expect(page.getByRole('list', { name: 'Attached values and identity elements' })).toContainText('Kindness in action');
  await page.getByRole('button', { name: 'Save dialogue' }).click();
  await expect(page.getByText('Dialogue saved.', { exact: true })).toBeVisible();
  await page.getByText('Continue in Cognitive Reframing', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Dialogue to copy from' }).selectOption({ index: 1 });
  await expect(page.getByRole('textbox', { name: 'Thought to copy' })).toHaveValue('I should finish everything today.');
  await page.getByRole('button', { name: 'Create reframing draft' }).click();
  await expect(page.getByText('Reframing draft saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open Cognitive Reframing' }).click();
  await expect(page.getByRole('textbox', { name: 'Thought or belief' })).toHaveValue('I should finish everything today.');
});

test('Thought Record saves private drafts and offers explicit reframing and mood handoffs', async ({ page, request }) => {
  const address = 'studio-thought-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Thought Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Thought/ })).toBeVisible();

  await page.goto(route('/becoming/thought-record'));
  await page.getByLabel('Date', { exact: true }).fill('2026-11-22');
  await page.getByLabel('Time', { exact: true }).fill('09:30');
  const next = page.getByRole('button', { name: 'Next step' });
  await next.click();
  await page.getByRole('textbox', { name: 'Automatic thoughts' }).fill('Synthetic thought for reflection');
  await page.getByRole('checkbox', { name: 'Anxious' }).check();
  await page.getByRole('spinbutton', { name: /Emotional intensity before/ }).fill('0');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Thought record draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Step 2 of 5/ })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Emotional intensity before/ })).toHaveValue('0');
  await next.click();
  await next.click();
  await next.click();
  await page.getByRole('textbox', { name: 'Balanced or helpful thought' }).fill('Synthetic helpful thought');
  await page.getByRole('button', { name: 'Complete entry' }).click();
  await expect(page.getByText('Thought record completed.')).toBeVisible();
  await page.reload();
  await page.getByText(/^Saved /).click();
  await expect(page.getByText('Synthetic thought for reflection', { exact: true })).toBeVisible();
  await expect(page.getByText('0 / 100', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Use responses from' }).selectOption({ index: 1 });
  await page.getByText('Take a thought to Cognitive Reframing').click();
  await expect(page.getByRole('textbox', { name: 'Helpful thought to carry forward' })).toHaveValue('Synthetic helpful thought');
  await page.getByRole('button', { name: 'Create reframing draft' }).click();
  await expect(page.getByText('Reframing draft saved.')).toBeVisible();
  await page.getByText('Take an emotion to Mood Tracker').click();
  await page.getByRole('combobox', { name: 'Emotion for today' }).selectOption('Anxious');
  await page.getByRole('button', { name: 'Add to today’s check-in' }).click();
  await expect(page.getByText('Emotion saved to today’s check-in.')).toBeVisible();
  await page.getByRole('link', { name: 'Open Mood Tracker' }).click();
  await expect(page.getByText('Today: Anxious')).toBeVisible();
  await page.goto(route('/becoming/thought-record?historyPage=2'));
  await expect(page.getByText('No entries on this page.')).toBeVisible();
  await page.getByRole('link', { name: 'Newer entries' }).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();
  await page.goto(route('/becoming/cognitive-reframing'));
  const thought = page.getByRole('textbox', { name: 'Thought or belief' });
  await expect(thought).toHaveValue('Synthetic thought for reflection');
  await thought.fill('Keep this local wording');
  await page.getByRole('combobox', { name: 'Thought Record' }).selectOption({ index: 1 });
  const importButton = page.getByRole('button', { name: 'Import into draft' });
  await expect(importButton).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I want to copy from the selected Thought Record.' }).check();
  await importButton.click();
  await expect(page.getByText(/Thought Record copied into blank fields/)).toBeVisible();
  await expect(thought).toHaveValue('Keep this local wording');
  await expect(page.getByRole('spinbutton', { name: /Intensity before reflection/ })).toHaveValue('0');
  const nextReframe = page.getByRole('button', { name: 'Next step' });
  for (let step = 1; step < 5; step++) await nextReframe.click();
  await expect(page.getByRole('article', { name: 'After reframing' })).toContainText('Synthetic helpful thought');
  await page.getByRole('textbox', { name: /What changed or stayed the same/ }).fill('My feelings stayed the same.');
  await page.getByRole('button', { name: 'Complete entry' }).click();
  await expect(page.getByText('Reframing entry completed.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('region', { name: 'Saved reframing entries' }).locator('summary').first().click();
  await expect(page.getByRole('article', { name: 'Before reframing' })).toContainText('Keep this local wording');
  await expect(page.getByRole('article', { name: 'After reframing' })).toContainText('My feelings stayed the same.');
});

test('Emotional Wheel saves private entries and shares multiple labels with Studio exercises', async ({ page, request }) => {
  const address = 'studio-emotion-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Emotion Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Emotion/ })).toBeVisible();

  await page.goto(route('/becoming/emotional-wheel'));
  await page.getByRole('searchbox', { name: 'Search emotion vocabulary' }).fill('Bittersweet');
  await page.getByRole('checkbox', { name: /^Bittersweet/ }).check();
  await page.getByRole('textbox', { name: 'Custom emotion' }).fill('Quiet resolve');
  await page.getByRole('button', { name: 'Add custom emotion' }).click();
  await page.getByRole('spinbutton', { name: /Intensity/ }).fill('0');
  await page.getByRole('textbox', { name: 'Physical sensations (optional)' }).fill('A synthetic sensation');
  await page.getByRole('button', { name: 'Save emotion entry' }).click();
  await expect(page.getByText('Emotion entry saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Emotions recorded in the selected period' })).toContainText('Quiet resolve');

  await page.goto(route('/becoming/mood-tracker'));
  const daily = page.getByRole('region', { name: 'Daily emotional check-in' });
  await daily.locator('summary').first().click();
  await daily.getByText('Use the Emotional Wheel', { exact: true }).click();
  await daily.getByRole('searchbox', { name: 'Search emotion vocabulary' }).fill('Steady');
  await daily.getByRole('checkbox', { name: /^Steady/ }).check();
  await daily.getByRole('button', { name: 'Save check-in' }).click();
  await expect(daily.getByText('Today: Steady')).toBeVisible();

  for (const module of ['cognitive-reframing', 'body-awareness-map', 'relationship-inventory', 'inner-critic-dialogue']) {
    await page.goto(route('/becoming/' + module));
    const relationship = module === 'relationship-inventory';
    const body = module === 'body-awareness-map';
    if (body) await page.getByRole('checkbox', { name: 'Jaw', exact: true }).check();
    if (relationship) await page.getByRole('textbox', { name: 'Relationship label' }).fill('Reading group');
    const openPicker = async () => {
      if (relationship) await page.getByText('Reflection questions (optional)', { exact: true }).click();
      await page.getByText(body ? 'Associated emotions (optional)' : relationship ? 'Use the Emotional Wheel' : 'Explore emotions (optional)', { exact: true }).click();
    };
    await openPicker();
    await page.getByRole('searchbox', { name: 'Search emotion vocabulary' }).fill('Bittersweet');
    await page.getByRole('checkbox', { name: /^Bittersweet/ }).check();
    await page.getByRole('button', { name: body ? 'Save observation' : relationship ? 'Save relationship' : 'Save draft', exact: true }).click();
    const saved = body ? 'Observation saved.' : relationship ? 'Relationship saved.' : module === 'cognitive-reframing' ? 'Reframing draft saved.'
      : module === 'inner-critic-dialogue' ? 'Dialogue draft saved.' : 'Draft saved.';
    await expect(page.getByText(saved, { exact: true })).toBeVisible();
    await page.reload();
    if (body) {
      await expect(page.getByRole('region', { name: 'Observation history' }).getByText('Emotions: Bittersweet')).toBeVisible();
    } else {
      await openPicker();
      await expect(page.getByRole('list', { name: 'Selected emotions' })).toContainText('Bittersweet');
    }
  }
});

test('Beyond the Box saves private sections, user-selected progress, journal entries and goals', async ({ page, request, browser }) => {
  test.setTimeout(300_000);
  const register = async (person: Page, name: string) => {
    const address = 'studio-social-' + crypto.randomUUID() + '@example.test';
    await person.goto(route('/login'));
    const origin = new URL(person.url()).origin;
    await person.getByRole('button', { name: /create an account/i }).click();
    await person.getByLabel('Your name').fill(name);
    await person.getByLabel('Email address').fill(address);
    await person.getByLabel('Password', { exact: true }).fill(originalPassword);
    await person.getByRole('button', { name: 'Create your account' }).click();
    await expect(person.getByText(/Check your email for a confirmation link/)).toBeVisible();
    await person.goto(await emailLink(request, address, route('/auth/confirm'), origin));
    await person.getByRole('button', { name: 'Confirm email' }).click();
    await expect(person.getByRole('heading', { name: new RegExp('Welcome back, ' + name) })).toBeVisible();
  };
  await register(page, 'Social');
  const path = route('/becoming/social-integration');
  await page.goto(path);
  const nav = page.getByRole('navigation', { name: 'Social Integration sections' });
  const select = async (name: string) => {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  };

  const awareness = page.getByRole('textbox', { name: 'What social environments suit me?' });
  await awareness.fill('Quiet places with written instructions.');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(page.getByText('Private entry saved.', { exact: true })).toBeVisible();
  const progress = page.getByRole('region', { name: 'My progress' });
  const marked = progress.getByRole('checkbox', { name: 'Social Self-Awareness' });
  await expect(marked).not.toBeChecked();
  await marked.check();
  await progress.getByRole('button', { name: 'Save progress preferences' }).click();
  await expect(page.getByText('Progress preferences saved.')).toBeVisible();
  await page.reload();
  await expect(awareness).toHaveValue('Quiet places with written instructions.');
  await expect(marked).toBeChecked();
  await marked.uncheck();
  await progress.getByRole('button', { name: 'Save progress preferences' }).click();
  await expect(page.getByText('Progress preferences saved.')).toBeVisible();
  await page.reload();
  await expect(marked).not.toBeChecked();

  await select('Social Ecosystem Map');
  await page.getByRole('button', { name: 'Community', exact: true }).click();
  await page.getByRole('textbox', { name: 'Circle name' }).fill('Art spaces');
  await page.getByRole('button', { name: 'Save ecosystem map' }).click();
  await expect(page.getByText('Private entry saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Art spaces', exact: true })).toBeVisible();

  await select('Communication Practice');
  await page.getByRole('button', { name: 'Use example as a starting point' }).click();
  await page.getByRole('textbox', { name: 'My response' }).fill('Would you like to compare notes?');
  await page.getByRole('button', { name: 'Save practice' }).click();
  await expect(page.getByText('Private entry saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'My response' })).toHaveValue('Would you like to compare notes?');

  await select('Community Exploration');
  await page.getByRole('combobox', { name: 'Activity type (optional)' }).selectOption('Book clubs');
  await page.getByRole('textbox', { name: 'Interest or activity I want to explore' }).fill('An online reading group');
  await page.getByRole('button', { name: 'Save community plan' }).click();
  await expect(page.getByText('An online reading group', { exact: true })).toBeVisible();

  await select('Personal Social Goals');
  await page.getByRole('textbox', { name: 'My social goal' }).fill('A short call');
  await page.getByRole('button', { name: 'Add social goal' }).click();
  await page.getByText('A short call · Active', { exact: true }).click();
  const edit = page.locator('details').filter({ hasText: 'A short call' });
  await edit.getByRole('combobox', { name: 'Goal status' }).selectOption('Postponed');
  await edit.getByRole('button', { name: 'Update social goal' }).click();
  await expect(page.getByText('A short call · Postponed', { exact: true })).toBeVisible();
  await edit.getByRole('combobox', { name: 'Goal status' }).selectOption('Declined');
  await edit.getByRole('button', { name: 'Update social goal' }).click();
  await expect(page.getByText('A short call · Declined', { exact: true })).toBeVisible();
  await page.goto(route('/becoming'));
  await expect(page.getByRole('region', { name: 'Personal growth goals' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Personal growth goals' }).getByText('A short call')).toHaveCount(0);
  await page.goto(path);

  await select('Social Interaction Journal');
  await page.getByRole('textbox', { name: 'Activity or interaction' }).fill('A quiet picnic');
  await page.getByRole('textbox', { name: 'Feelings after' }).fill('Rested');
  await page.getByRole('button', { name: 'Save interaction', exact: true }).click();
  await expect(page.getByText('Interaction saved.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText(/^A quiet picnic ·/).click();
  await expect(page.locator('details').filter({ hasText: 'A quiet picnic' }).getByRole('textbox', { name: 'Feelings after' })).toHaveValue('Rested');

  await select('Societal Expectations Reflection');
  await page.getByRole('textbox', { name: 'Where do I feel pressure to conform?' }).fill('Speaking without time to think.');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(page.getByText('Private entry saved.', { exact: true })).toBeVisible();

  await select('Weekly Social Reflection');
  await page.getByRole('textbox', { name: 'Where did I experience belonging?' }).fill('When a friend checked in by text.');
  await page.getByRole('button', { name: 'Save this week’s reflection' }).click();
  await expect(page.getByText('Private entry saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Where did I experience belonging?' })).toHaveValue('When a friend checked in by text.');
  const exported = await (await page.request.get(route('/personal-data'))).json();
  expect(exported.socialGoals).toHaveLength(1);
  expect(exported.socialInteractions[0].details['0']).toBe('A quiet picnic');

  const other = await browser.newContext();
  try {
    const outsider = await other.newPage();
    await register(outsider, 'Other');
    await outsider.goto(path + '?section=journal');
    await expect(outsider.getByText(/A quiet picnic/)).toHaveCount(0);
    await outsider.goto(path + '?section=goals');
    await expect(outsider.getByText(/A short call/)).toHaveCount(0);
    await outsider.goto(path);
    await expect(outsider.getByRole('textbox', { name: 'What social environments suit me?' })).toHaveValue('');
  } finally {
    await other.close();
  }
});

test('Body Awareness Map saves multiple regions and movement-only reflections in private history', async ({ page, request }) => {
  const address = 'studio-body-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Body Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Body/ })).toBeVisible();
  await page.goto(route('/becoming/body-awareness-map'));

  await page.getByRole('checkbox', { name: 'Arms', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Lower back', exact: true }).check();
  const arms = page.getByRole('group', { name: 'Arms observation' });
  await arms.getByRole('combobox', { name: 'Intensity (0 to 10)' }).selectOption('0');
  await arms.getByRole('combobox', { name: 'Sensation type' }).selectOption('Warmth');
  const back = page.getByRole('group', { name: 'Lower back observation' });
  await back.getByRole('combobox', { name: 'Sensation type' }).selectOption('Custom');
  await back.getByRole('textbox', { name: 'Custom sensation' }).fill('Fluttering');
  await back.getByRole('textbox', { name: 'Context (optional)' }).fill('After a quiet afternoon.');
  await page.getByRole('button', { name: 'Save observation' }).click();
  const history = page.getByRole('region', { name: 'Observation history' });
  await expect(history.getByText('Observation saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(history.getByText('Intensity: 0 / 10', { exact: true })).toBeVisible();
  await expect(history.getByText('Intensity: Unrated', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(history.getByRole('img', { name: 'Back body outline showing recorded regions' })).toBeVisible();
  await expect(history.getByText('Sensation: Fluttering', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Skip body mapping' }).click();
  await page.getByText('Optional movement or stillness reflection', { exact: true }).click();
  await page.getByRole('textbox', { name: 'What did you choose to do?' }).fill('Listened to the rain.');
  await page.getByRole('textbox', { name: 'What did you notice before?' }).fill('The room was quiet.');
  await page.getByRole('textbox', { name: 'What did you notice afterward?' }).fill('Rain on the windows.');
  await page.getByRole('button', { name: 'Save observation' }).click();
  await expect(history.getByText('Rain on the windows.', { exact: true })).toBeVisible();
  await expect(history.getByRole('img')).toHaveCount(0);
  const previous = history.getByRole('option', { name: /Lower back, Arms/ });
  await history.getByRole('combobox', { name: 'Saved observation' }).selectOption(await previous.getAttribute('value') ?? '');
  await expect(history.getByText('Sensation: Fluttering', { exact: true })).toBeVisible();
  const exported = await (await page.request.get(route('/personal-data'))).json();
  expect(exported.growthExercises.filter((item: { module_slug: string }) => item.module_slug === 'body-awareness-map')).toHaveLength(2);
});

test('Future-Self Visualization saves private boards, compares entries, and creates a goal with milestones', async ({ page, request }) => {
  const address = 'studio-future-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Future Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Future/ })).toBeVisible();
  await page.goto(route('/becoming/future-self-visualization'));

  await page.getByRole('combobox', { name: 'Reflection horizon' }).selectOption('6 months');
  await page.getByRole('textbox', { name: 'Who am I becoming?' }).fill('Someone with time to make things.');
  await page.getByRole('textbox', { name: 'What habits support this life?' }).fill('Sketch for ten minutes.');
  await page.getByRole('textbox', { name: 'What is one realistic action I can take now?' }).fill('Make time to draw.');
  await page.getByText('Private vision board (optional)', { exact: true }).click();
  await page.getByRole('button', { name: 'Add a vision board card' }).click();
  await page.getByRole('textbox', { name: 'Vision board card 1' }).fill('A sunny workspace');
  await page.getByText('Letter to my future self (optional)', { exact: true }).click();
  await page.getByRole('textbox', { name: 'My letter' }).fill('Find one calm place to work.');
  const review = page.getByLabel('Scheduled reflection date (optional)');
  await review.fill(await review.getAttribute('min') ?? '');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(page.getByText('Reflection saved.', { exact: true })).toBeVisible();
  const entryUrl = page.url();

  await page.getByRole('button', { name: 'Use my realistic action' }).click();
  await page.getByRole('textbox', { name: 'Milestone 1 (optional)' }).fill('Set out supplies');
  await page.getByRole('button', { name: 'Add a milestone' }).click();
  await page.getByRole('textbox', { name: 'Milestone 2 (optional)' }).fill('Choose a time');
  await page.getByRole('button', { name: 'Create growth goal' }).click();
  await expect(page.getByText('Goal and milestones saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Use my habit idea' }).click();
  await page.getByRole('button', { name: 'Add to Habit Tracker' }).click();
  await expect(page.getByText('Habit added.')).toBeVisible();

  await page.goto(route('/becoming'));
  await page.getByRole('link', { name: 'Revisit your future-self entry' }).click();
  await expect(page.getByRole('heading', { name: 'Edit your future-self entry' })).toBeVisible();
  await page.getByText('Letter to my future self (optional)', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'My letter' })).toHaveValue('Find one calm place to work.');
  await page.getByRole('textbox', { name: 'My letter' }).fill('Leave space for experimentation.');
  await page.getByRole('button', { name: 'Clear scheduled date' }).click();
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Compare future-self entries' });
  await expect(comparison.getByText('Leave space for experimentation.', { exact: true })).toBeVisible();
  await page.goto(route('/becoming'));
  await expect(page.getByRole('heading', { name: 'The Becoming Studio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Revisit your future-self entry' })).toHaveCount(0);
  await page.goto(entryUrl);

  await page.getByRole('link', { name: 'Start a new reflection' }).click();
  await expect(page.getByRole('heading', { name: 'Imagine a possible future' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Who am I becoming?' }).fill('Someone who shares work with others.');
  await page.getByRole('button', { name: 'Save reflection', exact: true }).click();
  await expect(comparison.getByRole('combobox', { name: 'Compare with' })).toBeVisible();
  await expect(comparison.getByText('Someone with time to make things.', { exact: false })).toBeVisible();
  await expect(comparison.getByText('Someone who shares work with others.', { exact: false })).toBeVisible();
  await expect(comparison.getByText('A sunny workspace', { exact: false })).toBeVisible();

  const response = await page.request.get(route('/personal-data'));
  const extracted = await response.json();
  expect(extracted.goals.map((item: { title: string }) => item.title)).toContain('Make time to draw.');
  expect(extracted.milestones.map((item: { title: string }) => item.title)).toEqual(expect.arrayContaining(['Set out supplies', 'Choose a time']));
  await page.goto(route('/becoming/habit-tracker'));
  await expect(page.getByRole('heading', { name: 'Sketch for ten minutes.', exact: true })).toBeVisible();
});

test('Life Timeline keeps images private and supports review, hiding and deletion', async ({ page, request }) => {
  const address = 'studio-timeline-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Timeline Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Timeline/ })).toBeVisible();
  await page.goto(route('/becoming/life-timeline'));
  const list = page.getByRole('region', { name: 'Your life timeline' });

  await page.getByRole('textbox', { name: 'Event title' }).fill('First studio');
  await page.getByRole('combobox', { name: 'Timing type' }).selectOption('approximate');
  await page.getByRole('textbox', { name: 'Approximate year' }).fill('2005');
  await page.getByRole('combobox', { name: 'Category (optional)' }).selectOption('Creativity');
  await page.getByRole('combobox', { name: 'How you describe this event (optional)' }).selectOption('Mixed');
  await page.getByText('Event notes (optional)', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Personal meaning' }).fill('Room to experiment.');
  await page.getByText('Private image (optional)', { exact: true }).click();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a50kAAAAASUVORK5CYII=';
  await page.getByLabel('Attach an image').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByText('Event saved.', { exact: true })).toBeVisible();
  await list.getByText('First studio', { exact: true }).click();
  await expect(list.getByText('Around 2005', { exact: true })).toBeVisible();
  await expect(list.getByText('Room to experiment.', { exact: false })).toBeVisible();
  const image = list.getByRole('img', { name: 'Private image for First studio' });
  const imagePath = await image.getAttribute('src') ?? '';
  await expect(image).toBeVisible();
  const imageResponse = await page.request.get(imagePath);
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()['cache-control']).toContain('no-store');
  expect((await imageResponse.body()).toString('base64')).toBe(png);
  expect((await request.get(new URL(imagePath, origin).href, { maxRedirects: 0 })).status()).toBe(307);
  const exported = await (await page.request.get(route('/personal-data'))).json();
  expect(exported.timelineImages[0].base64).toBe(png);

  await page.getByRole('checkbox', { name: 'Hide from my timeline' }).check();
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(list.getByRole('combobox', { name: 'Show events' })).toHaveValue('hidden');
  await list.getByRole('combobox', { name: 'Show events' }).selectOption('visible');
  await expect(list.getByText('First studio', { exact: true })).toHaveCount(0);
  await page.goto(route('/becoming'));
  await expect(page.getByRole('heading', { name: 'The Becoming Studio' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Progress history' }).getByRole('link', { name: 'Life Timeline', exact: true })).toHaveCount(0);

  await page.goto(route('/becoming/life-timeline'));
  await page.getByRole('textbox', { name: 'Event title' }).fill('Learn screen printing');
  await page.getByRole('checkbox', { name: 'Future milestone' }).check();
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(list.getByRole('heading', { name: 'Future milestones' })).toBeVisible();
  await expect(list.getByText('Learn screen printing', { exact: true })).toBeVisible();
  await list.getByRole('combobox', { name: 'Show events' }).selectOption('hidden');
  await list.getByText('First studio', { exact: true }).click();
  await list.getByRole('link', { name: 'Edit First studio' }).click();
  await expect(page.getByRole('textbox', { name: 'Event title' })).toHaveValue('First studio');
  await page.getByText('Delete this event', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Confirm event deletion' }).check();
  await page.getByRole('button', { name: 'Delete event permanently' }).click();
  await expect(list.getByText('Event deleted.', { exact: true })).toBeVisible();
  await page.goto(route('/becoming'));
  const history = page.getByRole('region', { name: 'Progress history' });
  await expect(history.getByText('Event saved', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recently completed exercises' }).getByRole('link', { name: 'Life Timeline' })).toHaveCount(0);
  expect((await page.request.get(imagePath)).status()).toBe(404);
});

test('Flexible Habit Tracker saves schedules, rest days, partial amounts and pause history', async ({ page, request }) => {
  const address = 'studio-habit-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Habit Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Habit/ })).toBeVisible();
  await page.goto(route('/becoming/habit-tracker?source=social'));
  await page.getByRole('textbox', { name: 'New habit' }).fill('A quiet sketch');
  await page.getByRole('combobox', { name: 'Frequency' }).selectOption('custom');
  await page.getByRole('spinbutton', { name: 'Repeat every (days)' }).fill('2');
  await page.getByRole('combobox', { name: 'Completion type' }).selectOption('Minutes');
  await page.getByRole('button', { name: 'Add habit', exact: true }).click();
  await expect(page.getByText('Habit added.', { exact: true })).toBeVisible();

  const log = page.getByRole('region', { name: 'Record or review a day' });
  const state = log.getByRole('combobox', { name: 'A quiet sketch activity' });
  await state.selectOption('Partially completed');
  await log.getByRole('spinbutton', { name: 'Minutes (optional)' }).fill('8');
  await log.getByRole('button', { name: 'Save activity' }).click();
  await expect(page.getByText('0 of 1 completed · 0% · 1 partial', { exact: true })).toBeVisible();
  await page.reload();
  await expect(state).toHaveValue('Partially completed');
  await expect(log.getByRole('spinbutton', { name: 'Minutes (optional)' })).toHaveValue('8');
  await state.selectOption('Rest day');
  await log.getByRole('button', { name: 'Save activity' }).click();
  await expect(page.getByText('No scheduled opportunities', { exact: true }).first()).toBeVisible();
  const exported = await (await page.request.get(route('/personal-data'))).json();
  expect(exported.growthHabitLogs).toHaveLength(1);
  expect(exported.growthHabitLogs[0].state).toBe('Rest day');
  expect(exported.growthHabits[0].source).toBe('social');

  const manage = page.getByRole('region', { name: 'Manage habits' });
  await manage.getByText('A quiet sketch', { exact: true }).click();
  await manage.getByRole('button', { name: 'Pause habit' }).click();
  await expect(manage.getByText('A quiet sketch · Paused', { exact: true })).toBeVisible();
  await manage.getByRole('button', { name: 'Resume habit' }).click();
  await expect(manage.getByRole('button', { name: 'Pause habit' })).toBeVisible();
  await page.getByRole('link', { name: 'Monthly', exact: true }).click();
  await expect(page.getByText('Previous four weeks', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Calendar days' })).toBeVisible();
});

test('Advanced Mood Tracker saves separate voluntary check-ins and retrieves them by local date', async ({ page, request }) => {
  const address = 'studio-mood-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Mood Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Mood/ })).toBeVisible();
  await page.goto(route('/becoming/mood-tracker'));

  await page.getByText('Schedule and reminder preferences', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Studio timezone' }).selectOption('Pacific/Kiritimati');
  await page.getByLabel('Afternoon time').fill('15:45');
  await page.getByRole('button', { name: 'Save mood preferences' }).click();
  await expect(page.getByText('Mood preferences saved.')).toBeVisible();
  await expect(page.getByText('15:45', { exact: true })).toBeVisible();
  const editor = page.getByRole('region', { name: 'Add a voluntary check-in' });
  const history = page.getByRole('region', { name: 'Mood history' });
  await editor.getByRole('combobox', { name: 'Overall mood rating (1 to 10)' }).selectOption('1');
  await editor.getByRole('combobox', { name: 'Energy rating (optional)' }).selectOption('3');
  await editor.getByText('Detailed check-in (optional)', { exact: true }).click();
  await editor.getByRole('textbox', { name: 'Journal entry (optional)' }).fill('A private reflection.');
  await editor.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(history.getByText('Check-in saved.', { exact: true })).toBeVisible();

  await editor.getByRole('combobox', { name: 'Overall mood rating (1 to 10)' }).selectOption('8');
  await editor.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(history.locator('summary').filter({ hasText: 'Voluntary' })).toHaveCount(2);
  const response = await page.request.get(route('/becoming/mood-tracker/export'));
  expect(response.headers()['cache-control']).toContain('no-store');
  const exported = await response.json();
  expect(exported.entries.map((item: { mood_rating: number }) => item.mood_rating)).toEqual([1, 8]);
  const day = exported.entries[0].local_date;
  for (const entry of exported.entries) {
    expect(entry.timezone).toBe('Pacific/Kiritimati');
    expect(entry.local_date).toBe(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(entry.occurred_at)));
  }
  await page.goto(route('/becoming/mood-tracker?day=' + day));
  await expect(history.locator('summary').filter({ hasText: 'Voluntary' })).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Visualization' }).selectOption('Weekly mood trends');
  const trend = page.getByRole('table', { name: /Weekly mood trends/ });
  await expect(trend.getByText('4.5 / 10', { exact: true })).toBeVisible();
  await expect(trend.getByText('No rating', { exact: true })).toHaveCount(6);

  await history.locator('summary').filter({ hasText: 'Voluntary' }).first().click();
  await history.getByRole('link', { name: 'Edit or delete check-in' }).click();
  const edit = page.getByRole('region', { name: 'Edit check-in' });
  await edit.getByRole('textbox', { name: 'Quick note (optional)' }).fill('Edited check-in.');
  await edit.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(history.getByText('Edited check-in.', { exact: true })).toBeVisible();
  await history.getByRole('link', { name: 'Edit or delete check-in' }).click();
  await edit.getByText('Delete this check-in', { exact: true }).click();
  await edit.getByRole('checkbox', { name: 'Confirm deletion' }).check();
  await edit.getByRole('button', { name: 'Delete check-in permanently' }).click();
  await expect(history.getByText('Check-in deleted.', { exact: true })).toBeVisible();
  await expect(history.locator('summary').filter({ hasText: 'Voluntary' })).toHaveCount(1);
});

test('Personal Growth Insights shows actual data and sample sizes with member-controlled categories', async ({ page, request, browser }) => {
  test.setTimeout(150_000);
  const register = async (person: Page, name: string) => {
    const address = 'studio-insights-' + crypto.randomUUID() + '@example.test';
    await person.goto(route('/login'));
    const origin = new URL(person.url()).origin;
    await person.getByRole('button', { name: /create an account/i }).click();
    await person.getByLabel('Your name').fill(name);
    await person.getByLabel('Email address').fill(address);
    await person.getByLabel('Password', { exact: true }).fill(originalPassword);
    await person.getByRole('button', { name: 'Create your account' }).click();
    await expect(person.getByText(/Check your email for a confirmation link/)).toBeVisible();
    await person.goto(await emailLink(request, address, route('/auth/confirm'), origin));
    await person.getByRole('button', { name: 'Confirm email' }).click();
    await expect(person.getByRole('heading', { name: new RegExp('Welcome back, ' + name) })).toBeVisible();
  };
  await register(page, 'Insights');
  await page.goto(route('/becoming/mood-tracker'));
  const editor = page.getByRole('region', { name: 'Add a voluntary check-in' });
  await editor.getByRole('combobox', { name: 'Overall mood rating (1 to 10)' }).selectOption('4');
  await editor.getByText('Detailed check-in (optional)', { exact: true }).click();
  await editor.getByRole('combobox', { name: 'Perceived belonging (optional)' }).selectOption('6');
  await editor.getByRole('textbox', { name: 'Journal entry (optional)' }).fill('Private text only for the check-in.');
  await editor.getByText('Context tags (optional)', { exact: true }).click();
  await editor.getByRole('button', { name: 'Creativity', exact: true }).click();
  await editor.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(page.getByText('Check-in saved.', { exact: true })).toBeVisible();

  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
  await page.goto(route('/becoming/life-timeline'));
  await page.getByRole('textbox', { name: 'Event title' }).fill('Open studio afternoon');
  await page.getByRole('combobox', { name: 'Timing type' }).selectOption('exact');
  await page.getByLabel('Event date').fill(tomorrow);
  await page.getByRole('checkbox', { name: 'Future milestone' }).check();
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByText('Event saved.', { exact: true })).toBeVisible();
  await page.getByText('Open studio afternoon', { exact: true }).click();
  await page.getByRole('link', { name: 'Explore this milestone in Future-Self Visualization' }).click();
  await page.getByRole('button', { name: /Use the timeline milestone date/ }).click();
  await expect(page.getByLabel('Custom horizon date')).toHaveValue(tomorrow);

  await page.goto(route('/becoming/insights?range=today'));
  await expect(page.getByRole('region', { name: 'Upcoming personal milestones' }).getByText('Open studio afternoon', { exact: true })).toBeVisible();
  const trend = page.getByRole('table', { name: 'Recorded mood ratings by period' });
  await expect(trend.getByText('4 / 10', { exact: true })).toBeVisible();
  await expect(trend.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Perceived belonging' })).toContainText('6 / 10');
  await expect(page.getByText('Private text only for the check-in.')).toHaveCount(0);
  await page.getByText('Choose which insights to show', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Mood trends', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Descriptive insights', exact: true }).check();
  await page.getByRole('button', { name: 'Save insight preferences' }).click();
  await expect(page.getByRole('heading', { name: 'Mood trends' })).toHaveCount(0);
  await expect(page.getByText('Dates with a check-in tagged Creativity: 1.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mood trends' })).toHaveCount(0);

  const other = await browser.newContext();
  try {
    const outsider = await other.newPage();
    await register(outsider, 'Other');
    await outsider.goto(route('/becoming/insights?range=today'));
    await expect(outsider.getByText('No numerical mood ratings in this period.')).toBeVisible();
    await expect(outsider.getByText('Dates with a check-in tagged Creativity: 1.')).toHaveCount(0);
  } finally { await other.close(); }
});

test('Becoming onboarding is optional and saves an editable starting plan', async ({ page, request }) => {
  const address = 'studio-onboarding-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Onboarding Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Onboarding/ })).toBeVisible();

  await page.goto(route('/becoming'));
  await page.getByRole('link', { name: 'Personalize my starting plan' }).click();
  await page.getByRole('button', { name: 'Skip onboarding' }).click();
  await expect(page.getByRole('link', { name: 'Set up an optional starting plan' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Set up an optional starting plan' }).click();

  await page.getByRole('checkbox', { name: 'Emotional awareness', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Habits and routines', exact: true }).check();
  await page.getByRole('button', { name: 'Add a custom goal' }).click();
  await page.getByRole('textbox', { name: 'Custom goal 1' }).fill('Spend more time sketching.');
  await page.getByText('Optional reflection and accessibility preferences', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Preferred reflection frequency' }).selectOption('Daily');
  await page.getByRole('combobox', { name: 'Notification preference' }).selectOption('In-app reminders');
  await page.getByRole('button', { name: 'Add a check-in time' }).click();
  await page.getByLabel('Check-in time 1', { exact: true }).fill('08:15');
  await page.getByRole('button', { name: 'Save starting plan preferences' }).click();
  await expect(page.getByText('Starting plan preferences saved.')).toBeVisible();

  await page.goto(route('/becoming'));
  const plan = page.getByRole('region', { name: 'Your starting plan' });
  await expect(plan.getByRole('link', { name: 'Mood Tracker' })).toBeVisible();
  await expect(plan.getByRole('link', { name: 'Habit Tracker' })).toBeVisible();
  await expect(plan.getByText('Spend more time sketching.')).toHaveCount(0);
  await plan.getByRole('link', { name: 'Change starting plan preferences' }).click();
  await expect(page.getByRole('textbox', { name: 'Custom goal 1' })).toHaveValue('Spend more time sketching.');
  await page.getByText('Optional reflection and accessibility preferences', { exact: true }).click();
  await expect(page.getByLabel('Check-in time 1', { exact: true })).toHaveValue('08:15');
  await page.getByRole('combobox', { name: 'Preferred reflection frequency' }).selectOption('Weekly');
  await page.getByRole('button', { name: 'Save starting plan preferences' }).click();
  await expect(page.getByText('Starting plan preferences saved.')).toBeVisible();
  await expect(plan.getByRole('link', { name: 'Emotional Wheel' })).toBeVisible();

  await page.getByRole('button', { name: 'Hide my starting plan' }).click();
  await expect(page.getByRole('link', { name: 'Set up an optional starting plan' })).toBeVisible();
  const exported = await (await page.request.get(route('/personal-data'))).json();
  expect(exported.notificationPreferences.growth_onboarding.frequency).toBe('Weekly');
  expect(exported.notificationPreferences.mood_preferences.reminders).toBe(false);
  expect(exported.notificationPreferences.onboarding_status).toBe('skipped');
});

test('Growth Reports save private snapshots, compare periods, and restrict PDF downloads to the owner', async ({ page, request, browser }) => {
  test.setTimeout(150_000);
  const register = async (person: Page, name: string) => {
    const address = 'studio-report-' + crypto.randomUUID() + '@example.test';
    await person.goto(route('/login'));
    const origin = new URL(person.url()).origin;
    await person.getByRole('button', { name: /create an account/i }).click();
    await person.getByLabel('Your name').fill(name);
    await person.getByLabel('Email address').fill(address);
    await person.getByLabel('Password', { exact: true }).fill(originalPassword);
    await person.getByRole('button', { name: 'Create your account' }).click();
    await expect(person.getByText(/Check your email for a confirmation link/)).toBeVisible();
    await person.goto(await emailLink(request, address, route('/auth/confirm'), origin));
    await person.getByRole('button', { name: 'Confirm email' }).click();
    await expect(person.getByRole('heading', { name: new RegExp('Welcome back, ' + name) })).toBeVisible();
  };

  await register(page, 'Reports');
  await page.goto(route('/becoming/mood-tracker'));
  const checkin = page.getByRole('region', { name: 'Add a voluntary check-in' });
  await checkin.getByRole('combobox', { name: 'Overall mood rating (1 to 10)' }).selectOption('6');
  await checkin.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(page.getByText('Check-in saved.', { exact: true })).toBeVisible();
  await page.goto(route('/becoming/reports'));
  const emotions = page.getByRole('region', { name: 'Emotional check-ins' });
  await expect(emotions.getByText('6 / 10 (n = 1)', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'What did I learn about myself?' }).fill('I enjoy quieter evenings.');
  await page.getByRole('button', { name: 'Save growth report', exact: true }).click();
  await expect(page.getByText('Growth report saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'What did I learn about myself?' })).toHaveValue('I enjoy quieter evenings.');
  await page.getByRole('link', { name: 'Compare with the previous period' }).click();
  await expect(page.getByRole('table', { name: 'Recorded activity by period' })).toContainText('6 / 10 (n = 1)');

  await page.getByRole('textbox', { name: 'What did I learn about myself?' }).fill('Quiet evenings help me reflect.');
  await page.getByRole('checkbox', { name: 'Emotional check-ins', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save growth report', exact: true }).click();
  await expect(page.getByText('Growth report saved.', { exact: true })).toBeVisible();
  await expect(emotions).toHaveCount(0);
  const exportData = await (await page.request.get(route('/personal-data'))).json();
  expect(exportData.growthReports[0].reflections.learning).toBe('Quiet evenings help me reflect.');
  expect(exportData.growthReports[0].snapshot.emotions).toBeUndefined();

  const pdfLink = page.getByRole('link', { name: 'Download saved report as PDF' });
  const pdfUrl = await pdfLink.getAttribute('href') ?? '';
  const pdf = await page.request.get(pdfUrl);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect(pdf.headers()['cache-control']).toContain('no-store');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const other = await browser.newContext();
  try {
    const outsider = await other.newPage();
    await register(outsider, 'Other');
    const denied = await outsider.request.get(new URL(pdfUrl, page.url()).href);
    expect(denied.status()).toBe(404);
  } finally { await other.close(); }

  await page.getByRole('checkbox', { name: 'Monthly report reminders' }).check();
  await page.getByRole('button', { name: 'Save report reminder preferences' }).click();
  await expect(page.getByText('Report reminder preferences saved.')).toBeVisible();
  await page.goto(route('/becoming'));
  const notice = page.getByRole('region', { name: 'Studio report reminder' });
  await expect(notice.getByText('A Studio report is available.', { exact: true })).toBeVisible();
  await expect(notice.getByText(/Quiet evenings/)).toHaveCount(0);

  await page.goto(route('/becoming/reports'));
  await page.getByText('Delete this report', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Confirm report deletion' }).check();
  await page.getByRole('button', { name: 'Delete growth report permanently' }).click();
  await expect(page.getByText('Growth report deleted.', { exact: true })).toBeVisible();
  expect((await page.request.get(pdfUrl)).status()).toBe(404);
});

test('Centralized reminders deliver generic notifications once and honor snooze, pause and disable', async ({ page, request }) => {
  await page.addInitScript(() => {
    class TestNotification {
      static get permission() { return sessionStorage.getItem('reminder-permission') ?? 'default'; }
      static async requestPermission() {
        sessionStorage.setItem('reminder-permission', 'granted');
        return 'granted';
      }
      constructor(title: string, options: { body: string }) {
        const delivered = JSON.parse(sessionStorage.getItem('test-reminders') ?? '[]');
        sessionStorage.setItem('test-reminders', JSON.stringify([...delivered, { title, body: options.body }]));
      }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: TestNotification });
  });
  const address = 'studio-reminders-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Reminder Tester');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Reminder/ })).toBeVisible();
  await page.goto(route('/becoming/notifications'));

  const prefs = page.getByRole('region', { name: 'Reminder preferences' });
  await prefs.getByRole('combobox', { name: 'Studio timezone' }).selectOption('UTC');
  const morning = prefs.locator('details').filter({ hasText: 'Morning mood check-in ·' });
  await morning.getByText('Morning mood check-in · Off', { exact: true }).click();
  await morning.getByRole('checkbox', { name: 'Enable morning mood check-in reminder' }).check();
  await morning.getByLabel('Local time', { exact: true }).fill('00:00');
  await morning.getByRole('combobox', { name: 'Delivery channel' }).selectOption('both');
  await prefs.getByRole('button', { name: 'Save reminder settings' }).click();
  await expect(page.getByText('Reminder settings saved.', { exact: true })).toBeVisible();
  const inbox = page.getByRole('region', { name: 'Reminder inbox' });
  await expect(inbox.getByText('Take a moment for yourself.', { exact: true })).toHaveCount(1);
  const delivered = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('test-reminders') ?? '[]'));
  expect(await delivered()).toEqual([]);
  await page.getByRole('button', { name: 'Allow browser notifications' }).click();
  await expect.poll(delivered).toEqual([{ title: 'The Becoming Studio', body: 'Take a moment for yourself.' }]);
  await page.reload();
  await expect(inbox.getByText('Take a moment for yourself.', { exact: true })).toHaveCount(1);
  const poll = await page.request.post(route('/becoming/notifications/poll'), { data: { browser: true, inbox: false } });
  expect((await poll.json()).browser).toHaveLength(0);
  expect(await delivered()).toHaveLength(1);

  await inbox.getByRole('button', { name: 'Snooze 15 minutes' }).click();
  await expect(inbox.getByText(/Snoozed\./)).toBeVisible();
  const snoozed = await page.request.post(route('/becoming/notifications/poll'), { data: { browser: true, inbox: false } });
  expect((await snoozed.json()).notices).toHaveLength(0);
  await page.getByRole('button', { name: 'Pause reminders for 24 hours' }).click();
  await expect(page.getByText('Reminders paused for 24 hours.')).toBeVisible();
  await page.getByRole('button', { name: 'Resume reminders' }).click();
  await expect(page.getByText('Reminders resumed.')).toBeVisible();

  await prefs.getByRole('checkbox', { name: 'Disable all reminders' }).check();
  await prefs.getByRole('button', { name: 'Save reminder settings' }).click();
  await expect(page.getByText('Reminder settings saved.', { exact: true })).toBeVisible();
  await page.goto(route('/becoming'));
  await expect(page.getByRole('region', { name: 'Studio reminders' })).toHaveCount(0);
  const exported = await (await page.request.get(route('/personal-data'))).json();
  expect(exported.notificationPreferences.central_reminders.enabled).toBe(false);
  expect(exported.reminderEvents).toHaveLength(1);
});

test('release account smoke covers confirmation, persistent login, recovery and deletion', async ({ page, request, browser }) => {
  test.setTimeout(240_000);
  const address = 'studio-release-' + crypto.randomUUID() + '@example.test';
  await page.goto(route('/login'));
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Your name').fill('Release Fixture');
  await page.getByLabel('Email address').fill(address);
  await page.getByLabel('Password', { exact: true }).fill(originalPassword);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByText(/Check your email for a confirmation link/)).toBeVisible();
  await page.goto(await emailLink(request, address, route('/auth/confirm'), origin));
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back, Release/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Welcome back, Release/ })).toBeVisible();
  expect((await page.context().cookies()).some(cookie => cookie.name.includes('-auth-token') && cookie.httpOnly)).toBe(true);

  await page.goto(route('/account'));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto(route('/forgot-password'));
  await page.getByLabel('Email address').fill(address);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const resetLink = await emailLink(request, address, route('/auth/recovery'), origin);
  const recovery = await browser.newContext();
  try {
    const reset = await recovery.newPage();
    await reset.goto(resetLink);
    await reset.getByRole('button', { name: 'Continue to password reset' }).click();
    await reset.getByLabel('New password', { exact: true }).fill(newPassword);
    await reset.getByLabel('Confirm new password').fill(newPassword);
    await reset.getByRole('button', { name: 'Update password' }).click();
    await expect(reset.getByText(/Password updated/)).toBeVisible();
  } finally {
    await recovery.close();
  }

  await page.goto(route('/login'));
  await signIn(page, address, newPassword);
  await expect(page.getByRole('heading', { name: /Welcome back, Release/ })).toBeVisible();
  await page.goto(route('/account'));
  await page.getByText('Delete my account', { exact: true }).click();
  await page.getByLabel('Current password').fill(newPassword);
  await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT');
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();
  await expect(page.getByText('Your account was deleted.')).toBeVisible();
  await signIn(page, address, newPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
});
