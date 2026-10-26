/**
 * Shared helpers for the Playwright specs.
 *
 * Setting up data through the UI in every spec would be slow and would test the same screens over
 * and over, so specs that are about something else create users, habits and completions through
 * the REAL API with `page.request`, which shares the browser's cookies: the page is then logged
 * in as that user. The user's timezone is UTC so specs can compute dates without guessing the
 * machine's timezone.
 */
import { expect } from '@playwright/test';
import { DateTime } from 'luxon';

export const PASSWORD = 'correct-horse-42';

let counter = 0;
/** A unique email per call (runs share one test database). */
export function uniqueEmail(testInfo, label = 'user') {
  counter += 1;
  return `e2e-${label}-${testInfo.project.name}-${Date.now()}-${counter}@example.com`;
}

/** "Today" for API-created users (timezone UTC), and days relative to it. */
export const today = () => DateTime.utc().toISODate();
export const daysAgo = (n) => DateTime.utc().minus({ days: n }).toISODate();

/** Saves a full-page screenshot named after the project. */
export async function snap(page, testInfo, name) {
  await page.screenshot({
    path: `test-results/screens/${testInfo.project.name}-${name}.png`,
    fullPage: true,
  });
}

/** No sideways scrolling at this viewport (a common mobile layout bug). */
export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Main navigation link: the sidebar on desktop, the bottom bar on phones (one is hidden). */
export const navLink = (page, name) =>
  page.getByRole('navigation').getByRole('link', { name, exact: true });

/**
 * Calls the API as the page's user, adding the CSRF header from the browser's cookie (as the
 * SPA's apiClient does). Returns Playwright's APIResponse.
 */
export async function api(page, method, path, data) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'csrf_token')?.value;
  return page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
  });
}

/** Signs up a new user through the API (timezone UTC); the page is then logged in. */
export async function signupViaApi(page, testInfo, { name = 'Ana Lima', label } = {}) {
  const email = uniqueEmail(testInfo, label);
  const res = await page.request.post('/api/v1/auth/signup', {
    data: { name, email, password: PASSWORD, timezone: 'UTC' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { email, user: (await res.json()).user };
}

/** Creates a habit through the API; returns the habit. */
export async function createHabit(page, fields) {
  const res = await api(page, 'POST', '/habits', { startDate: daysAgo(30), ...fields });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).habit;
}

/** Marks a habit done on each date through the API. */
export async function complete(page, habitId, dates) {
  for (const date of dates) {
    const res = await api(page, 'PUT', `/habits/${habitId}/completions/${date}`);
    expect([200, 201]).toContain(res.status());
  }
}
