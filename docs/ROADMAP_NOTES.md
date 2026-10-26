# Roadmap notes: deferred features and where they plug in

The first release deliberately leaves out several features listed in the PRD (§3, "Later"). The architecture already has a place for each one. This document says where, so future work extends the design instead of fighting it. The binding rules stay in [CLAUDE.md](../CLAUDE.md); a new rule needs a new ADR in [DECISIONS.md](DECISIONS.md).

| Feature | Status today | Where it plugs in |
|---|---|---|
| Billing / paid plans | Plans table + entitlements, no payments | `workspace_subscriptions`, `entitlementService` |
| Team workspaces, invitations | Schema ready, no endpoints | `workspaces`, `workspace_members`, `resolveWorkspace` / `requireRole` |
| Push and email notifications | In-app only | `NotificationChannel` subclasses ([MOBILE_READINESS.md](MOBILE_READINESS.md)) |
| Exports | None | A read-only service on top of `analyticsService` / `GET /completions` |
| Advanced schedules | daily / weekdays / weekly target | `domain/schedule.js`, `habitStateIssues`, `domain/streaks.js` |
| React Native client | API-ready | [MOBILE_READINESS.md](MOBILE_READINESS.md) |
| PWA (offline) | Manifest and icons only (ADR-055) | A service worker + background sync of the idempotent completion endpoints |

## Billing

**Already in place:**
- `plans` holds `free` and `pro`, with `limits` and `features` stored as JSON. `pro` has `features.purchasable = false` (ADR-026).
- `workspace_subscriptions` has `status`, `current_period_end`, `provider`, `provider_customer_id` and `provider_subscription_id`, all waiting for a provider.
- `entitlementService.assertCanCreateActiveHabit()` reads limits **from the plan**, never from code, and locks the workspace row (ADR-036).
- The UI shows "Pro: coming soon" (Settings → Plan).

**To add:**
1. **A provider (Stripe is the usual choice).**
   - Add `POST /billing/checkout`, which creates a Checkout Session for the active workspace (owner role only, using `requireRole('owner')`), and `POST /billing/portal`.
   - Add `POST /billing/webhook`. It is **public, but verified with the provider's signature**. Add it to the route-guard test's public list and exclude it from CSRF; the guard test documents both. Webhooks must read the **raw** request body for signature checks, so mount that route before `express.json()`.
2. **Webhook handler:** upsert `workspace_subscriptions` from the provider's events (`active`, `past_due`, `canceled`). Make it idempotent by storing processed event ids (a `billing_events(id unique)` table).
3. **Entitlements need no change:** a workspace with an active `pro` subscription gets `pro.limits`. The web app already reads the plan from `GET /auth/me`.
4. **Downgrades:** when a workspace goes back to free with more than 10 active habits, keep them all (never delete data) but block **new** active habits. That is already how the limit check behaves.
5. **Config:** set `features.purchasable = true` in the plans seeder for `pro`, and put prices in the provider, not in code.
6. **Testing:** use the provider's test mode and fixtures for the webhook payloads.

## Team workspaces and invitations

**Already in place:**
- `workspaces.workspace_type` is `personal` or `team`.
- `workspace_members` has roles (`owner`, `admin`, `member`), and only one personal workspace is allowed per user.
- `resolveWorkspace` picks the workspace from `X-Workspace-Id` (404 for non-members, ADR-029), and `requireRole(...)` exists and is tested.
- Every query is scoped by `workspace_id`; the IDOR review is in QA_REPORT.md.
- Completions are per user (`completed_by`), so team members can share a habit and still have their own history and streaks.
- Reminder dispatch already checks membership (Phase 11).

**To add:**
1. **Workspace endpoints:**
   - `POST /workspaces` creates a team; the creator becomes owner and gets a free subscription, in one transaction as at signup.
   - `PATCH /workspaces/:id` (rename).
   - `DELETE /workspaces/:id` (owner only). It cascades like account deletion. Remember ADR-032: account deletion is blocked while the user owns a team.
2. **Invitations:**
   - Add an `invitations` table: `workspace_id`, `email`, `role`, `token_hash` (store a hash only, like sessions), `expires_at`, `accepted_at`, `invited_by`.
   - `POST /workspaces/:id/invitations` (admin+), `POST /invitations/:token/accept`, and `DELETE` to revoke.
   - Email delivery comes from the email channel below; until then, show a copyable link.
3. **Members:**
   - `GET /workspaces/:id/members`, `PATCH /members/:id` (role) and `DELETE /members/:id` (remove or leave).
   - Decide what happens to the departing member's reminders (delete them) and completions (keep them as history, hidden, as today).
4. **Frontend:**
   - A workspace switcher in the AppShell (`setActiveWorkspaceId` in `services/apiClient.js` already sends the header).
   - Invalidate every query when switching workspaces, as a timezone change does.
5. **Plan limits** are per workspace already. Decide whether teams need a seat limit (add `maxMembers` to `plans.limits`).

## Push and email notifications

Push is fully described in [MOBILE_READINESS.md](MOBILE_READINESS.md#push-notifications-what-remains).

**Email:**
- Write an `EmailChannel extends NotificationChannel` that uses a transactional provider (Postmark, Resend or SES) behind an env var (`EMAIL_PROVIDER_KEY`), disabled when unset, like `SENTRY_DSN`.
- Add an `email: false` default to `notificationPreferences` (opt-in), an unsubscribe link with a signed token, and a daily digest instead of one email per reminder.
- The same channel can later send invitation emails, password-reset emails and email-verification emails. Password reset needs a `password_resets` table storing a hash and an expiry, rate-limited like login.

## Exports

- Add `GET /exports/completions.csv?from&to` and `GET /exports/habits.json`. They're read-only and workspace-scoped, so they reuse the same services and the 366-day range validation, or a paged loop for "all time".
- Stream CSV rows (`res.write`) rather than building a large string, and use `Content-Disposition: attachment`.
- For a full account export (GDPR-style), use a background job that writes a ZIP and notifies the user through `dispatchNotification`.
- Gate it behind a plan feature if needed: `plans.features.exports`.

## Advanced schedules

Examples: "every 2 days", "monthly on the 1st", "X times per month" and skipping holidays.

The changes stay inside the pure domain layer:

1. **Schema:** add a new `frequency_type` value and its parameters, as columns on `habits` or a JSON `schedule_rule` column. That means a migration extending the CHECK (ADR-024: VARCHAR + CHECK makes this one statement).
2. **`domain/schedule.js` `isScheduledOn()`:** add a case for the new type.
3. **`validators/habitValidators.js` `habitStateIssues()`:** add the cross-field rules for the new type, shared by create and PATCH.
4. **`domain/streaks.js` and `domain/analytics.js`:**
   - Decide the unit of evaluation (day, week or month). Monthly targets work like `weekly_target`, with a different period.
   - Add hand-written cases **and** extend the randomized reference cross-check in `tests/unit/streaks.reference.test.js`.
   - Keep the 100% coverage threshold.
5. **Rules:** document them in `docs/STREAK_RULES.md` and add an ADR. The streak and rate rules are binding product rules (CLAUDE.md §3.1).
6. **Frontend:** a new option in the habit form's frequency control, and `schedule.js` summaries.

## Housekeeping for any of the above

- Each new endpoint needs:
  - the route-guard test (it fails automatically if auth or CSRF is missing);
  - an authorization test (401, 404 for other workspaces);
  - entries in `docs/API.md` and `openapi.yaml`.
- Each new page needs a Playwright story and an entry in `e2e/accessibility.spec.js`.
- Run `npm run perf:bench` after touching today, streaks or analytics. The target is p95 under 200 ms on the perf dataset.
