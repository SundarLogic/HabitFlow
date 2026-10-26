/**
 * Reviewing progress and managing the account, end to end, on desktop and on a 375 px phone
 * (Phase 10 "done when"): habit detail (calendar toggle, note, reminder) -> analytics (period
 * filter in the URL, heatmap, history) -> notification panel -> settings (profile, timezone,
 * plan) -> delete the account.
 *
 * Reminder notifications themselves need the scheduler, which never runs under NODE_ENV=test;
 * the panel's behaviour with notifications is covered by the Vitest suite.
 * Screenshots are saved to test-results/screens/ for visual review.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'correct-horse-42';

async function snap(page, testInfo, name) {
  await page.screenshot({
    path: `test-results/screens/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}

async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const navLink = (page, name) =>
  page.getByRole('navigation').getByRole('link', { name, exact: true });

test('progress review and account settings work end to end', async ({ page }, testInfo) => {
  const email = `e2e-review-${testInfo.project.name}-${Date.now()}@example.com`;

  // --- Sign up, add a habit and tick it ------------------------------------------------------
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Ana Lima');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: /Add “Drink water”/ }).click();
  await page.getByRole('button', { name: 'Mark Drink water complete' }).click();
  await expect(page.getByText('1 of 1 done')).toBeVisible();

  // --- Habit detail ---------------------------------------------------------------------------
  await page.getByRole('link', { name: 'Drink water' }).click();
  await expect(page.getByRole('heading', { name: 'Drink water', level: 1 })).toBeVisible();
  await expect(page.getByText('Current streak').locator('..')).toContainText('1 day');

  // The calendar: today is done; untick and tick it again from here.
  const calendar = page.getByRole('region', { name: 'Calendar' });
  const todayCell = calendar.getByRole('button', { pressed: true });
  await expect(todayCell).toHaveCount(1);
  await todayCell.click();
  await expect(calendar.getByRole('button', { name: /: not done yet$/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await calendar.getByRole('button', { name: /: not done yet$/ }).click();
  await expect(calendar.getByRole('button', { name: /: done$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // A note for today and a reminder.
  const notes = page.getByRole('region', { name: 'Notes' });
  await notes.getByRole('textbox', { name: 'Note for today' }).fill('Two litres');
  await notes.getByRole('button', { name: 'Save note' }).click();
  await expect(notes.getByText('Two litres', { exact: true }).last()).toBeVisible();

  const reminders = page.getByRole('region', { name: 'Reminders' });
  await reminders.getByLabel('New reminder').fill('07:30');
  await reminders.getByRole('button', { name: 'Add' }).click();
  await expect(reminders.getByLabel('Reminder 1 time')).toHaveValue('07:30');
  await expectNoHorizontalScroll(page);
  await snap(page, testInfo, '6-habit-detail');

  // --- Analytics ------------------------------------------------------------------------------
  await navLink(page, 'Analytics').click();
  await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
  await page.getByText('7 days', { exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\?range=7d$/);
  await expect(page.getByRole('grid', { name: 'Last 12 months' })).toBeVisible();
  await expect(page.getByRole('grid').getByRole('gridcell')).toHaveCount(365);
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByRole('link', { name: 'Drink water' })).toBeVisible();
  await expect(history.getByText('“Two litres”')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await snap(page, testInfo, '7-analytics');

  // --- Notifications panel --------------------------------------------------------------------
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByText(/You're all caught up/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // --- Settings -------------------------------------------------------------------------------
  await navLink(page, 'Settings').click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const profile = page.getByRole('region', { name: 'Profile' });
  await profile.getByLabel('Name').fill('Ana Maria Lima');
  await profile.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();

  const timezone = page.getByRole('region', { name: 'Timezone' });
  await timezone.getByRole('combobox', { name: /Timezone/ }).fill('Asia/Tokyo');
  await timezone.getByRole('button', { name: 'Save timezone' }).click();
  await expect(page.getByText('Timezone set to Asia/Tokyo')).toBeVisible();

  await expect(page.getByRole('region', { name: 'Plan' })).toContainText('1 of 10 active habits');
  await expectNoHorizontalScroll(page);
  await snap(page, testInfo, '8-settings');

  // --- Delete the account ---------------------------------------------------------------------
  await page.getByRole('button', { name: 'Delete account' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' });
  await dialog.getByLabel('Password').fill(PASSWORD);
  await dialog.getByLabel(/Type DELETE/).fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByText('Your account has been deleted')).toBeVisible();

  // The account is really gone: logging in fails.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText(/Invalid email or password/);
});
