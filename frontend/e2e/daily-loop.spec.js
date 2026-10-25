/**
 * The core daily loop, end to end, on desktop and on a 375 px phone (Phase 9 "done when"):
 * sign up -> first habit from a template -> create a habit with the form -> tick it off ->
 * reload (still done, still logged in) -> browse days -> archive on the Habits page ->
 * all done for today -> log out.
 *
 * Screenshots of the key screens are saved to test-results/screens/ for visual review.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'correct-horse-42';

/** Saves a full-page screenshot named after the project (desktop / mobile-375). */
async function snap(page, testInfo, name) {
  await page.screenshot({
    path: `test-results/screens/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}

/** No sideways scrolling at this viewport (a common mobile layout bug). */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Main navigation link: the sidebar on desktop, the bottom bar on phones (one is hidden). */
const navLink = (page, name) =>
  page.getByRole('navigation').getByRole('link', { name, exact: true });

test('the daily loop works end to end', async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;

  // --- Sign up -> first-run screen ------------------------------------------------------------
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Ana Lima');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: "Let's build your first habit" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await snap(page, testInfo, '1-first-run');

  // --- One-click template ---------------------------------------------------------------------
  await page.getByRole('button', { name: /Add “Drink water”/ }).click();
  await expect(page.getByRole('button', { name: 'Mark Drink water complete' })).toBeVisible();

  // --- Create a habit with the form -----------------------------------------------------------
  await page.getByRole('button', { name: 'New habit' }).click();
  const dialog = page.getByRole('dialog', { name: 'New habit' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await dialog.getByLabel('Name').fill('Read 10 pages');
  await dialog.getByLabel('Category').fill('Learning');
  await dialog.getByText('Times per week', { exact: true }).first().click();
  await expect(dialog.getByRole('spinbutton', { name: 'Times per week' })).toHaveValue('3');
  await dialog.getByText('Daily', { exact: true }).click(); // back to daily for a predictable test
  await snap(page, testInfo, '2-habit-form');
  await dialog.getByRole('button', { name: 'Create habit' }).click();
  await expect(dialog).toBeHidden();

  // --- Tick it off: instant, counted, celebrated when everything is done ---------------------
  const readToggle = page.getByRole('button', { name: 'Mark Read 10 pages complete' });
  await readToggle.click();
  await expect(readToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 of 2 done')).toBeVisible();
  await snap(page, testInfo, '3-today-progress');

  // --- Reload: still logged in, still done ----------------------------------------------------
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark Read 10 pages complete' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // --- Browse days ----------------------------------------------------------------------------
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('heading', { name: 'Yesterday', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}$/);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();

  // --- Habits page: archive one --------------------------------------------------------------
  await navLink(page, 'Habits').click();
  await expect(page.getByRole('heading', { name: 'Habits', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Drink water' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByRole('link', { name: 'Drink water' })).toBeHidden();
  await expectNoHorizontalScroll(page);
  await snap(page, testInfo, '4-habits');

  // --- Back to Today: everything left is done -------------------------------------------------
  await navLink(page, 'Today').click();
  await expect(page.getByText('1 of 1 done')).toBeVisible();
  await expect(page.getByText(/All done for today/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await snap(page, testInfo, '5-all-done');

  // --- Log out ---------------------------------------------------------------------------------
  await page.getByRole('button', { name: /Account menu for Ana Lima/ }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
