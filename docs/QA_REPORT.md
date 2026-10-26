# HabitFlow QA report: Phase 11 hardening

Date: 2026-10-26. Scope: the first release, meaning the backend API and the React web app.

This report covers four things:
- what was checked;
- what was found and fixed;
- the evidence: which tests and commands back each claim;
- the known limitations.

Decisions made along the way are recorded in [DECISIONS.md](DECISIONS.md) as ADR-051 to ADR-055.

## Summary

| Area | Result |
|---|---|
| Backend tests | **557 passing** (was 492), 35 suites, run with `npm run test:coverage` |
| Frontend tests | **92 passing** (was 88), 12 files, run with `npm test` |
| End-to-end | **52 passing**: 18 tests on desktop, Pixel 5 and 375 px. 2 skipped by design: the keyboard test runs on desktop only |
| Coverage | streaks.js and analytics.js 100%. Domain 99.2% statements / 98.8% branches. Services 98.2% / 85.4%. Enforced by Jest thresholds |
| Dependencies | `npm audit` reports 0 vulnerabilities in both packages (one high was fixed) |
| Accessibility | 0 serious or critical axe violations on every page and dialog, in light and dark themes. Lighthouse accessibility score is 100 on every page tested |
| API latency | p95 is under 200 ms for every endpoint on a 350k-completion dataset. Worst case: `/today` at 103 ms, down from 934 ms |
| Lighthouse (mobile) | Performance scores: 100 on Today, Habits and Settings; 96 on Analytics (was 90); 94 on Login |

## 1. End-to-end user stories (PRD §5)

These live in `frontend/e2e/user-stories.spec.js`. They run against the real API and Postgres on three viewports: desktop at 1280 px, a Pixel 5, and a 375 px phone.

| Story | What is asserted |
|---|---|
| Register | Signup works. Registering the same email again in different case is rejected with "An account with this email already exists" |
| Create a habit | An empty name is refused, with `aria-invalid` set and an error shown. A daily, a specific-days and a times-per-week habit are created through the form, then checked on several dates: each appears only on its scheduled dates, never before its start date, and the weekday habit shows under "Not scheduled" on other days |
| Complete and undo | The toggle state, "N of 1 done", 100% and the streak (2 → 3 → 2 days) all update. Five simultaneous saves of the same day store exactly one completion |
| View a streak | Marking a missed past day in the habit calendar changes the current streak from 1 to 5 days and the longest from 3 to 5 |
| Review history | A custom date range shows exactly the expected numbers: "2 / 6" completed, a 33% rate, and 2 history entries. A completion just outside the range is excluded |
| Archive a habit | The archived habit leaves Today and the active list. Its completions remain in the Analytics history, and its own page shows them read-only |
| Protect privacy | A second user gets **404** from eight endpoints for the first user's habit: GET, PATCH, DELETE, history, reminders, PUT completion, completions filtered by it, and analytics filtered by it. The UI shows "Habit not found". The owner's habit is unchanged |
| Log out | `/habits`, `/analytics`, `/settings` and `/habits/:id` redirect to `/login?returnTo=…`. The old session gets 401 from the API |

The Phase 9 and Phase 10 journeys (`daily-loop`, `progress-review`) also run on all three viewports.

## 2. Accessibility

### Checked

- **axe-core** (`@axe-core/playwright`, WCAG 2.2 A and AA rules) runs on every screen, in both the light and the dark theme. The screens are: login, signup, first-run Today, Today with data, the habit form, Habits, the actions menu, habit detail, Analytics with a data table open, the notification panel, Settings, the delete-account dialog and the 404 page. Any serious or critical violation fails the run, and no axe rule is disabled.
- **Colour contrast** of at least 4.5:1 is checked in both themes, through axe's `color-contrast` rule on the rendered pages.
- **Keyboard** behaviour is checked on desktop:
  - The first Tab stop is the skip link, and pressing it moves focus to the main content.
  - Twelve further Tab stops each show a visible focus indicator.
  - The habit dialog is opened from the keyboard and keeps focus inside it through 40 Tab presses and a Shift+Tab. Escape closes it and focus returns to the "New habit" button.
  - The habit toggles announce their state through `aria-pressed`, keep a constant name, and keep focus when the row moves to the other group.
- **prefers-reduced-motion:** the computed transition and animation durations are effectively zero.
- **Lighthouse accessibility score** is 100 on Login, Today, Habits, Analytics and Settings.

### Found and fixed

1. **Dark-mode contrast:** white text and icons on the light green "done" fill measured about 1.9:1, and white text on the light red "Delete" button failed as well. Two new tokens fix this: `--hf-on-completed` (7.9:1 in dark mode, 5.5:1 in light) and `--hf-on-danger` (5.8:1 in dark mode, 6.3:1 in light).
2. **Upcoming calendar days** were drawn at 60% opacity and failed contrast. They are now at full strength.
3. **Label in Name (WCAG 2.5.3):**
   - The account menu's visible initials weren't part of its accessible name. The initials are now drawn with CSS.
   - The weekly-strip day buttons had names that didn't contain their visible text. Each name now begins with exactly what is shown, for example "Tue 50%: Oct 20, 1 of 2 done". The real browser's computed name is asserted in the E2E test.
4. **Invisible focus on date and time inputs:** when Tab reaches the calendar or clock button inside these inputs, Chromium stops matching `:focus` on the input, so no ring showed. Form fields now use `:focus-within`.
5. **Charts:** Recharts 3 inserts a focusable keyboard layer, and here it sat inside an `aria-hidden` chart container, so screen-reader users could land on an element they can't hear. The layer is now turned off; every chart already has a "Show data" table.
6. **Chart data tables** sat in a scroll box that a keyboard couldn't reach. The box is now focusable and named.
7. **Missing `<h1>`** on full-page states: the 404 page, the crash screen and "Habit not found". "Habit not found" also now sets the page title.
8. **Reduced motion** didn't stop the bars in the charts, which are animated in JavaScript. They now respect the preference.

## 3. Security review (backend)

### Checked

| Item | How it was checked | Result |
|---|---|---|
| Every protected route has auth and CSRF, plus a workspace where relevant | `tests/integration/routeGuards.test.js` walks the real Express routers (34 routes). It checks the middleware order, then sends every protected route a request with no session (expecting 401) and every unsafe route a cookie request without the CSRF header (expecting 403). The test was confirmed to fail when `requireAuth` is removed from a route | Pass, after a fix (below) |
| IDOR | Every Sequelize call and raw SQL statement in `src/services` was reviewed, including how request ids reach them | No exploitable gap. One defence-in-depth fix (below) |
| Logs contain no secrets | `tests/integration/logSecrets.test.js` captures real pino output during signup, login, a cookie write, Bearer use, a password change and a failed login, then searches it for the actual password, new password, session token and CSRF token | Pass |
| Production behaviour | `tests/integration/production.test.js` runs the app as `NODE_ENV=production` in a child process | Session cookie is `HttpOnly; Secure; SameSite=Lax`. CSRF cookie is `Secure; SameSite=Lax` and readable by the app. Headers include HSTS, `nosniff`, `X-Frame-Options` and a CSP, with no `X-Powered-By`. CORS allows only configured origins. Bodies over 100 kb get 413. A thrown error and a real failing SQL query both return only `INTERNAL_ERROR` / "Internal server error", with no stack trace and no SQL |
| Rate limits | Existing tests (10 login/signup attempts per IP and email; general `/api` limit) plus new proxy tests | Pass |
| Dependencies | `npm audit` on both packages | 0 vulnerabilities after the fixes below |

### Found and fixed

1. Read-only routers (analytics, completions, today, workspaces, `/auth/me`) didn't include `csrfProtection`. Nothing could be forged through them today, since CSRF only applies to unsafe methods, but a write added there later would have shipped unprotected. Every protected route now has the same chain, enforced by the route-guard test.
2. **`npm audit`:**
   - `body-parser` had a high-severity denial-of-service issue; upgraded to 2.4.0.
   - `uuid` (inside Sequelize) had a moderate issue. npm's own fix would downgrade Sequelize to v3, so `uuid` is pinned to `^11.1.1` with `overrides` instead. That version keeps the CommonJS API Sequelize uses, and all tests pass.
3. **`TRUST_PROXY`** (follow-up from ADR-033): the default of 0 ignores `X-Forwarded-For`, so a client can't spoof an IP to dodge rate limits. Behind a proxy, set it to the number of proxies. Tested both ways.
4. The rate limits are now configurable through `API_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX`. The defaults are unchanged (300 and 10).
5. Reminder dispatch now also requires the user to still be a member of the habit's workspace. This isn't reachable today, but it protects a future "leave workspace" feature. Tested.
6. Database constraint errors now have messages written for people, and account deletion explains why it was blocked when the user still owns a team workspace.

## 4. Robustness

| Scenario | Behaviour | Evidence |
|---|---|---|
| Double submit | Buttons are disabled while their request runs, including the template buttons and the detail page's Archive and Restore. Completions are idempotent in the database | Vitest: a double-click on a template creates one habit. E2E: 5 concurrent PUTs store 1 row |
| Constraint errors | Friendly messages (section 3) | Backend tests |
| Offline | A banner shows while offline, and "Back online" when the connection returns. A save made offline fails at once and rolls back; its toast has a **Retry** button. Nothing is queued, since there is no offline sync | Vitest: the banner, plus a failed toggle followed by a successful retry |
| Session ends mid-use | The app shows "Your session has ended", goes to `/login?returnTo=<page>` and returns to that page after login. No duplicate "couldn't save" messages | Vitest |

## 5. Performance

### API

`npm run perf:seed` builds the dataset: 20 users, each with 50 habits started two years ago, about 350k completions in total. `npm run perf:bench` measured 100 sequential requests per endpoint locally:

| Endpoint | p95 before | p95 after |
|---|---|---|
| GET /today | 934 ms | **103 ms** |
| GET /analytics/summary (30 days) | 925 ms | **87 ms** |
| GET /analytics/summary (366 days) | 1327 ms | **98 ms** |
| GET /analytics/heatmap (year) | 1134 ms | **94 ms** |
| GET /habits, /habits/:id, /habits/:id/history, /completions | 7–31 ms | 6–9 ms |

- **Cause:** `EXPLAIN ANALYZE` showed every hot query using an index, at about 6 ms of SQL. The time was in JavaScript: a Luxon date object per date operation, plus a Sequelize model instance for each of about 15k rows.
- **Fix (ADR-051):**
  - Date arithmetic now uses integers, cross-checked against Luxon for 80,000 consecutive days.
  - Parsed dates are cached (memoized).
  - Completions load as plain rows.
- **Indexes:** none were missing, so no migration was needed. The only sequential scans were on tables of about 1,000 rows, where Postgres correctly prefers a scan.

### Frontend

- Habit detail, Analytics and Settings are lazy-loaded routes.
- Recharts is now a separate chunk loaded by the Analytics page only when there is data to chart: 104 kB gzipped, out of the page chunk, which is now 3.8 kB.
- Lighthouse 12 (mobile profile) was run against the production build served by `vite preview` on the demo data. Scores are medians of 3 runs, except Login, which is a single run.

| Page | Performance | Accessibility | LCP | TBT | CLS |
|---|---|---|---|---|---|
| Login | 94 | 100 | 2.6 s | 130 ms | 0 |
| Today | 100 | 100 | 1.8 s | 40 ms | 0 |
| Habits | 100 | 100 | 1.6 s | 20 ms | 0 |
| Analytics | 96 | 100 | 2.1 s | 200 ms | 0 |
| Settings | 100 | 100 | 1.7 s | 0 ms | 0 |

## 6. PWA basics

The app now has:
- a web manifest: name, standalone display, start URL and colours;
- PNG icons at 192 and 512 px, a maskable 512 px icon and an Apple touch icon, generated from the logo by `frontend/scripts/generate-icons.js`;
- a `theme-color` per colour scheme.

There is no service worker and no offline sync, by design (ADR-055).

## 7. Known limitations

- **Reminders in E2E:** reminders are never delivered in the E2E runs, because the scheduler is off under `NODE_ENV=test`. Delivery is covered by the backend scheduler tests with a fake clock, and the notification panel by Vitest.
- **Browsers:** everything ran in Chromium only. There were no Firefox or Safari runs and no manual screen-reader session (NVDA or VoiceOver). The keyboard flow is automated on desktop Chromium.
- **What axe can see:** axe checks the states the tests render. Hover-only and transient states (toasts mid-animation, open tooltips) are not covered.
- **Reduced motion:** the chart-animation switch is verified in code; the E2E test checks the CSS durations.
- **Latency figures** come from one developer machine with sequential requests and no concurrency or load test. The Lighthouse scores vary on that machine; one Analytics run scored 83 under memory pressure, which is why medians are reported.
- **Services branch coverage** is 85.4%, just over the target. Most of the uncovered branches are default parameters, such as `now = systemNow`, which tests always override.
- **Session expiry** with a real expired session is covered by backend tests; the UI handling is tested with a simulated 401.
- **Rate limiter:** it is in memory, so a deployment with several instances needs a shared store (ADR-033). The E2E API server raises the general limit because a whole run comes from one IP.
- **uuid override:** `overrides.uuid` must be revisited when Sequelize is upgraded.
- **Data tables:** the charts' data tables are collapsed by default. Screen-reader users reach them through the "Show data" toggle, which is announced with each chart.
