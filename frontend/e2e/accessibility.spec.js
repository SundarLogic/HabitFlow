/**
 * Accessibility, checked in a real browser (Phase 11):
 *
 *   1. axe-core on every page and dialog, in the light AND dark theme, with WCAG 2.2 A/AA rules
 *      (which include colour contrast >= 4.5:1). Zero serious or critical violations allowed.
 *   2. The keyboard flow (desktop): skip link first, a visible focus ring on every stop, the
 *      habit dialog traps focus and gives it back, toggles announce their state.
 *   3. prefers-reduced-motion: animations and transitions are switched off.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { complete, createHabit, daysAgo, signupViaApi } from './helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Runs axe on the current page and fails with a readable list of serious/critical problems. */
async function expectNoSeriousViolations(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${label}: [${v.impact}] ${v.id} (${v.help}) at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
  expect(serious, serious.join('\n')).toEqual([]);
}

/** The screens to check: [label, how to get there]. Run after a user with data is logged in. */
function screens(habitId) {
  return [
    [
      'today',
      async (page) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
        await expect(
          page.getByRole('button', { name: /^Mark .* complete$/ }).first(),
        ).toBeVisible();
        // Weekly strip: each day's name starts with its visible text, then the details
        // ("Tue 50%: Oct 20, 1 of 2 done"), as the browser computes it.
        const strip = page.getByRole('region', { name: 'Last 7 days' }).getByRole('button');
        await expect(strip).toHaveCount(7);
        for (const button of await strip.all()) {
          await expect(button).toHaveAccessibleName(
            /^\w{3}( \d+%)?: \w{3} \d{1,2}, (nothing due|\d+ of \d+ done)$/,
          );
        }
      },
    ],
    [
      'habit form',
      async (page) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'New habit' }).first().click();
        await expect(page.getByRole('dialog', { name: 'New habit' })).toBeVisible();
      },
    ],
    [
      'habits',
      async (page) => {
        await page.goto('/habits');
        await expect(page.getByRole('heading', { name: 'Habits', level: 1 })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Walk' })).toBeVisible();
      },
    ],
    [
      'habit actions menu',
      async (page) => {
        await page.goto('/habits');
        await page.getByRole('button', { name: 'Actions for Walk' }).click();
        await expect(page.getByRole('menu')).toBeVisible();
      },
    ],
    [
      'habit detail',
      async (page) => {
        await page.goto(`/habits/${habitId}`);
        await expect(page.getByRole('heading', { name: 'Walk', level: 1 })).toBeVisible();
        await expect(
          page.getByRole('region', { name: 'Calendar' }).getByRole('table'),
        ).toBeVisible();
      },
    ],
    [
      'analytics',
      async (page) => {
        await page.goto('/analytics');
        await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
        await expect(page.getByRole('grid', { name: 'Last 12 months' })).toBeVisible();
        // Open one data table so its markup is checked too.
        await page.getByText('Show data').first().click();
      },
    ],
    [
      'notifications panel',
      async (page) => {
        await page.goto('/');
        await page.getByRole('button', { name: /^Notifications/ }).click();
        await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
      },
    ],
    [
      'settings',
      async (page) => {
        await page.goto('/settings');
        await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
        await expect(page.getByText(/of 10 active habits/)).toBeVisible();
      },
    ],
    [
      'delete account dialog',
      async (page) => {
        await page.goto('/settings');
        await page.getByRole('button', { name: 'Delete account' }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
      },
    ],
    [
      'not found',
      async (page) => {
        await page.goto('/no-such-page');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      },
    ],
  ];
}

for (const theme of ['light', 'dark']) {
  test.describe(`axe, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // The saved theme is read before the first paint (index.html), like a returning user's.
      await page.addInitScript((value) => localStorage.setItem('hf-theme', value), theme);
    });

    test('public pages', async ({ page }) => {
      for (const path of ['/login', '/signup']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoSeriousViolations(page, `${theme} ${path}`);
      }
    });

    test('first-run Today (empty state)', async ({ page }, testInfo) => {
      await signupViaApi(page, testInfo);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: "Let's build your first habit" }),
      ).toBeVisible();
      await expectNoSeriousViolations(page, `${theme} empty today`);
    });

    test('every app screen with data', async ({ page }, testInfo) => {
      await signupViaApi(page, testInfo);
      const walk = await createHabit(page, {
        name: 'Walk',
        category: 'Health',
        frequencyType: 'daily',
      });
      const gym = await createHabit(page, {
        name: 'Gym',
        frequencyType: 'weekdays',
        weekdays: [1, 3, 5],
      });
      await createHabit(page, { name: 'Swim', frequencyType: 'weekly_target', targetPerWeek: 2 });
      await complete(page, walk.id, [daysAgo(1), daysAgo(2), daysAgo(4)]);
      await complete(page, gym.id, []);
      for (const [label, open] of screens(walk.id)) {
        await open(page);
        await expectNoSeriousViolations(page, `${theme} ${label}`);
      }
    });
  });
}

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard flow is checked on desktop');

  test('skip link, visible focus, dialog focus trap and restore, toggle state', async ({
    page,
  }, testInfo) => {
    await signupViaApi(page, testInfo);
    await createHabit(page, { name: 'Walk', frequencyType: 'daily' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Mark Walk complete' })).toBeVisible();

    // 1. The first Tab stop is the skip link, and it moves focus to the main content.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    // 2. Every one of the next stops has a visible focus indicator.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const visible = await page.evaluate(() => {
        const el = document.activeElement;
        const style = getComputedStyle(el);
        const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        return {
          tag: el.tagName,
          name: el.getAttribute('aria-label') ?? el.textContent?.trim(),
          ok: outline || style.boxShadow !== 'none',
        };
      });
      expect(visible.ok, `no visible focus on ${visible.tag} "${visible.name}"`).toBe(true);
    }

    // 3. The habit dialog: opened from the keyboard, traps focus, Escape returns it.
    const newHabit = page.getByRole('button', { name: 'New habit' }).first();
    await newHabit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'New habit' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(newHabit).toBeFocused();

    // 4. A toggle keeps its name and announces its state through aria-pressed.
    const toggle = page.getByRole('button', { name: 'Mark Walk complete' });
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toBeFocused();
    // While the save is in flight the toggle is aria-disabled (ADR-047); wait until it's settled.
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

test('prefers-reduced-motion switches animations and transitions off', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signupViaApi(page, testInfo);
  await createHabit(page, { name: 'Walk', frequencyType: 'daily' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Mark Walk complete' });
  await expect(toggle).toBeVisible();
  const durations = await toggle.evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.transitionDuration, style.animationDuration];
  });
  for (const value of durations) {
    for (const part of value.split(',')) expect(parseFloat(part)).toBeLessThan(0.001);
  }
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
});
