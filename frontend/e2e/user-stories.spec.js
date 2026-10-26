/**
 * Every PRD §5 user story, end to end in a real browser against the real API and database, on
 * every Playwright project (desktop, Pixel 5, 375 px):
 *
 *   Register ............ valid signup works; a duplicate email is rejected
 *   Create a habit ...... required fields validated; each frequency type appears only on its dates
 *   Complete / undo ..... state, streak and percent update; duplicates are prevented
 *   View a streak ....... editing a past date recalculates the streak
 *   Review history ...... a custom date range shows the right counts and entries
 *   Archive a habit ..... leaves Today, history stays in analytics and on the detail page
 *   Protect privacy ..... another user gets 404 for the first user's habit (API and UI)
 *   Log out ............. protected pages redirect to login; the API answers 401
 */
import { expect, test } from '@playwright/test';
import { DateTime } from 'luxon';
import {
  PASSWORD,
  api,
  complete,
  createHabit,
  daysAgo,
  expectNoHorizontalScroll,
  navLink,
  signupViaApi,
  snap,
  today,
  uniqueEmail,
} from './helpers.js';

/** The habit row on Today (found through its name link). */
const row = (page, name) =>
  page.getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) });
const toggle = (page, name) => page.getByRole('button', { name: `Mark ${name} complete` });
/** The value under a StatCard label. */
const stat = (page, label) =>
  page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

test('Register: a valid signup creates the account; a duplicate email is rejected', async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo, 'register');
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Ana Lima');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: "Let's build your first habit" })).toBeVisible();

  await page.getByRole('button', { name: /Account menu for Ana Lima/ }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Someone Else');
  await page.getByLabel('Email').fill(email.toUpperCase()); // emails are case-insensitive
  await page.getByLabel('Password', { exact: false }).first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('An account with this email already exists')).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test('Create a habit: fields are validated and each frequency type appears only on its scheduled dates', async ({
  page,
}, testInfo) => {
  await signupViaApi(page, testInfo);
  await page.goto('/');
  const todayName = DateTime.utc().toFormat('cccc'); // e.g. "Monday"
  const start = daysAgo(7);

  /** Creates a habit through the form, starting a week ago. */
  async function createInForm(name, frequency) {
    await page.getByRole('button', { name: 'New habit' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New habit' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByText(frequency, { exact: true }).first().click();
    if (frequency === 'Specific days') {
      for (const day of [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ]) {
        // The checkbox is visually hidden; users click its visible chip (the <label>).
        const box = dialog.getByRole('checkbox', { name: day });
        if ((await box.isChecked()) !== (day === todayName)) {
          await dialog.locator(`label[for="${await box.getAttribute('id')}"]`).click();
        }
        await expect(box).toBeChecked({ checked: day === todayName });
      }
    }
    await dialog.getByLabel('Start date').fill(start);
    await dialog.getByRole('button', { name: 'Create habit' }).click();
    await expect(dialog).toBeHidden();
  }

  // Required fields: an empty name is refused and the form stays open.
  await page.getByRole('button', { name: 'New habit' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New habit' });
  await dialog.getByRole('button', { name: 'Create habit' }).click();
  await expect(dialog.getByRole('alert').first()).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await createInForm('Walk', 'Daily');
  await createInForm('Gym', 'Specific days');
  await createInForm('Swim', 'Times per week');

  // Today: all three are due.
  for (const name of ['Walk', 'Gym', 'Swim']) await expect(toggle(page, name)).toBeVisible();

  // Yesterday: the weekday habit is not scheduled; the others are.
  await page.goto(`/?date=${daysAgo(1)}`);
  await expect(toggle(page, 'Walk')).toBeVisible();
  await expect(toggle(page, 'Swim')).toBeVisible();
  await expect(toggle(page, 'Gym')).toHaveCount(0);
  await expect(page.getByText('Not scheduled this day (1)')).toBeVisible();

  // Exactly a week ago is the same weekday again: scheduled.
  await page.goto(`/?date=${start}`);
  await expect(toggle(page, 'Gym')).toBeVisible();

  // Before the start date nothing is scheduled.
  await page.goto(`/?date=${daysAgo(8)}`);
  await expect(page.getByRole('heading', { name: 'Nothing scheduled for this day' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('Complete and undo: the toggle, streak and percent update; duplicates are prevented', async ({
  page,
}, testInfo) => {
  await signupViaApi(page, testInfo);
  const habit = await createHabit(page, {
    name: 'Read',
    frequencyType: 'daily',
    startDate: daysAgo(5),
  });
  await complete(page, habit.id, [daysAgo(2), daysAgo(1)]);
  await page.goto('/');

  await expect(page.getByText('0 of 1 done', { exact: true })).toBeVisible();
  await expect(row(page, 'Read')).toContainText('Current streak:2 days');

  await toggle(page, 'Read').click();
  await expect(toggle(page, 'Read')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 of 1 done', { exact: true })).toBeVisible();
  await expect(page.getByText('100%').first()).toBeVisible();
  await expect(row(page, 'Read')).toContainText('Current streak:3 days');

  await toggle(page, 'Read').click();
  await expect(toggle(page, 'Read')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('0 of 1 done', { exact: true })).toBeVisible();
  await expect(row(page, 'Read')).toContainText('Current streak:2 days');

  // Duplicate records are prevented: five simultaneous saves of one day store one completion.
  await Promise.all(
    Array.from({ length: 5 }, () => api(page, 'PUT', `/habits/${habit.id}/completions/${today()}`)),
  );
  const list = await api(
    page,
    'GET',
    `/completions?from=${today()}&to=${today()}&habitId=${habit.id}`,
  );
  expect((await list.json()).meta.total).toBe(1);
});

test('View a streak: marking a missed past day in the calendar recalculates the streak', async ({
  page,
}, testInfo) => {
  await signupViaApi(page, testInfo);
  const habit = await createHabit(page, {
    name: 'Stretch',
    frequencyType: 'daily',
    startDate: daysAgo(6),
  });
  await complete(page, habit.id, [daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(1)]); // 2 days ago missed
  await page.goto(`/habits/${habit.id}`);

  await expect(stat(page, 'Current streak')).toHaveText('1 day');
  await expect(stat(page, 'Longest streak')).toHaveText('3 days');

  const missed = DateTime.fromISO(daysAgo(2));
  if (!missed.hasSame(DateTime.utc(), 'month')) {
    await page.getByRole('button', { name: 'Previous month' }).click();
  }
  const label = missed.toLocaleString(
    { weekday: 'short', month: 'short', day: 'numeric' },
    { locale: 'en-US' },
  );
  const calendar = page.getByRole('region', { name: 'Calendar' });
  await calendar.getByRole('button', { name: `${label}: missed` }).click();
  await expect(calendar.getByRole('button', { name: `${label}: done` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The gap is filled: 5 days in a row up to yesterday (today is still pending).
  await expect(stat(page, 'Current streak')).toHaveText('5 days');
  await expect(stat(page, 'Longest streak')).toHaveText('5 days');
  await snap(page, testInfo, 'stories-streak');
});

test('Review history: a custom range shows the right counts and entries', async ({
  page,
}, testInfo) => {
  await signupViaApi(page, testInfo);
  const habit = await createHabit(page, {
    name: 'Journal',
    frequencyType: 'daily',
    startDate: daysAgo(20),
  });
  await complete(page, habit.id, [daysAgo(10), daysAgo(5), daysAgo(3)]);

  // Days 6..1 ago are due (today is still open): 6 due, 2 done in range (the 10-days-ago one is outside).
  await page.goto(`/analytics?range=custom&from=${daysAgo(6)}&to=${today()}`);
  await expect(page.getByRole('radio', { name: 'Custom' })).toBeChecked();
  await expect(stat(page, 'Completed')).toHaveText('2 / 6');
  await expect(stat(page, 'Completion rate')).toHaveText('33%');
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByText('Page 1 of 1 · 2 completions')).toBeVisible();
  await expect(history.getByRole('link', { name: 'Journal' })).toHaveCount(2);
});

test('Archive a habit: it leaves Today, and its history stays in analytics and on its page', async ({
  page,
}, testInfo) => {
  await signupViaApi(page, testInfo);
  const habit = await createHabit(page, { name: 'Old habit', frequencyType: 'daily' });
  await createHabit(page, { name: 'Keep me', frequencyType: 'daily' });
  await complete(page, habit.id, [daysAgo(2), daysAgo(1)]);
  await page.goto('/');
  await expect(toggle(page, 'Old habit')).toBeVisible();

  await navLink(page, 'Habits').click();
  await page.getByRole('button', { name: 'Actions for Old habit' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByRole('link', { name: 'Old habit' })).toBeHidden();

  await navLink(page, 'Today').click();
  await expect(toggle(page, 'Keep me')).toBeVisible();
  await expect(toggle(page, 'Old habit')).toHaveCount(0);

  await navLink(page, 'Analytics').click();
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByRole('link', { name: 'Old habit' })).toHaveCount(2);

  await page.goto(`/habits/${habit.id}`);
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await expect(stat(page, 'Completions')).toHaveText('2');
  // History is read-only: no day of the calendar is a button (only month navigation is).
  const calendar = page.getByRole('region', { name: 'Calendar' });
  await expect(calendar.getByRole('table')).toBeVisible();
  await expect(calendar.getByRole('button', { name: /: (done|missed|not done yet)$/ })).toHaveCount(
    0,
  );
});

test("Protect privacy: another user can't see or change the first user's habit", async ({
  page,
  browser,
}, testInfo) => {
  await signupViaApi(page, testInfo, { label: 'owner' });
  const habit = await createHabit(page, { name: 'Private habit', frequencyType: 'daily' });

  const otherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const other = await otherContext.newPage();
  await signupViaApi(other, testInfo, { name: 'Mallory', label: 'other' });
  const attempts = [
    ['GET', `/habits/${habit.id}`],
    ['PATCH', `/habits/${habit.id}`, { name: 'Hacked' }],
    ['DELETE', `/habits/${habit.id}`],
    ['GET', `/habits/${habit.id}/history`],
    ['GET', `/habits/${habit.id}/reminders`],
    ['PUT', `/habits/${habit.id}/completions/${today()}`],
    ['GET', `/completions?from=${daysAgo(7)}&to=${today()}&habitId=${habit.id}`],
    ['GET', `/analytics/summary?habitId=${habit.id}`],
  ];
  for (const [method, path, data] of attempts) {
    const res = await api(other, method, path, data);
    expect(res.status(), `${method} ${path}`).toBe(404);
  }
  await other.goto(`/habits/${habit.id}`);
  await expect(other.getByRole('heading', { name: 'Habit not found' })).toBeVisible();
  await otherContext.close();

  // Nothing changed for the owner.
  const mine = await api(page, 'GET', `/habits/${habit.id}`);
  expect((await mine.json()).habit.name).toBe('Private habit');
});

test('Log out: protected pages redirect to login and the API refuses the old session', async ({
  page,
}, testInfo) => {
  await signupViaApi(page, testInfo);
  const habit = await createHabit(page, { name: 'Walk', frequencyType: 'daily' });
  await page.goto('/');
  await page.getByRole('button', { name: /Account menu for Ana Lima/ }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  for (const path of ['/habits', '/analytics', '/settings', `/habits/${habit.id}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/login?returnTo=${encodeURIComponent(path)}`);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  }
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect((await api(page, 'GET', '/habits')).status()).toBe(401);
});
