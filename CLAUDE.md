# CLAUDE.md — HabitFlow

> **Single source of truth** for how HabitFlow is built. Read this file fully before every phase.
> If code and this file disagree, either fix the code or update this file in the same change — never leave them divergent.
> Product requirements live in [docs/HabitFlow_PRD.md](docs/HabitFlow_PRD.md); decision rationale lives in [docs/DECISIONS.md](docs/DECISIONS.md).

---

## 1. Product summary

HabitFlow is a habit-tracking SaaS. Users create recurring habits (daily, selected weekdays, or a weekly target), mark completions in a few seconds, and track streaks, completion rates and long-term history.
It ships first as a responsive React web app backed by a REST/JSON API that a future React Native client will reuse.
The architecture is SaaS-ready from day one: user/workspace isolation and plan entitlements. Billing, team collaboration and the mobile client come later.
Missing a day must never produce punitive feedback. Core tracking stays useful on the free tier.

### First-release scope (PRD §3)

| Feature | First release | Later |
|---|---|---|
| Registration, login, account settings | Yes | Enhancements |
| Habit CRUD + flexible schedules (daily / weekdays / weekly target) | Yes | Advanced schedules |
| Completion history and streaks | Yes | Additional insights |
| Dashboard and basic analytics (calendar/heatmap, weekly/monthly) | Yes | Advanced reports, exports |
| In-app reminders + notifications | Yes | Push / email delivery |
| Responsive web app | Yes | PWA improvements |
| Mobile | API-ready architecture only | React Native client |
| Plans | Free/paid plan definitions + basic entitlements | Billing automation |
| Team workspaces | Data model prepared (workspaces, members) | Collaboration features |

### Out of scope for first release

- Payments / billing automation / subscription endpoints
- Team collaboration, workspace invitations, team management endpoints, shared habits
- React Native client, push notifications, email delivery
- Advanced schedules, advanced reports, exports
- Wearables, AI coaching, social challenges

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), React Router, TanStack Query, Tailwind CSS, Recharts |
| Backend | Node 20, Express, PostgreSQL 16, Sequelize + sequelize-cli, Zod, Luxon, bcrypt, pino, helmet, cors, express-rate-limit, node-cron |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend), Playwright (E2E) |
| Local infra | Docker Compose (PostgreSQL 16, databases `habitflow_dev` and `habitflow_test`) |

Do not add dependencies outside this list without recording the decision in `docs/DECISIONS.md`.

---

## 3. Architectural decisions (binding)

* Auth = server-side sessions table; opaque random token in HttpOnly+Secure+SameSite=Lax cookie; only SHA-256 hash stored; logout deletes row; same token accepted as Bearer header for future mobile.
* CSRF = double-submit cookie (csrf_token cookie + X-CSRF-Token header) on all non-GET requests.
* All timestamps TIMESTAMPTZ in UTC; calendar dates DATEONLY 'YYYY-MM-DD'; "today" computed in user's IANA timezone via Luxon. Never use the server's local time for business logic.
* Completion uniqueness = UNIQUE(habit_id, completed_by, completion_date).
* Weeks = ISO weeks Monday–Sunday in the user's timezone.
* Streak rules (daily, weekdays, weekly-target), pending vs missed, completable-date rules, retention policy, active workspace via X-Workspace-Id header (default = personal workspace), free plan = 10 active habits with limits in the plans table.

### 3.1 Domain rules (detail for the decisions above)

_Approved by the product owner on 2026-10-14. These rules are binding: change them only through a new ADR in `docs/DECISIONS.md`._

**Auth / sessions**
- Token: 32 bytes from `crypto.randomBytes`, base64url. Cookie name `hf_session`. Only `sha256(token)` is stored in `sessions.token_hash` (unique), along with `user_id`, `expires_at`, `last_used_at`, `created_at`, `user_agent`.
- Session lifetime = `SESSION_TTL_DAYS` (default 30). Expired sessions are rejected and purged by a node-cron job.
- `Authorization: Bearer <token>` is accepted as an alternative to the cookie. **CSRF checks apply only to cookie-authenticated requests**, not Bearer.
- Passwords: bcrypt, cost ≥ 12. Login failures return a generic `INVALID_CREDENTIALS` and do not reveal whether the email exists.
- Auth endpoints (signup/login) are rate-limited with express-rate-limit.
- `csrf_token` cookie: random, **not** HttpOnly (the SPA must read it), SameSite=Lax, Secure in production. The server compares it to the `X-CSRF-Token` header in constant time. Mismatch → 403 `CSRF_TOKEN_INVALID`.

**Time**
- `users.timezone` is a valid IANA zone (validated with Luxon), default `UTC`.
- "Today" for a user = `DateTime.now().setZone(user.timezone).toISODate()`. Never `new Date()` for calendar logic.
- Inject a clock (`now()` provider) into services so tests can freeze time.

**Schedules**
- `frequency_type` ∈ `daily` | `weekdays` | `weekly_target`.
- `daily`: every calendar day from `start_date` is a scheduled day.
- `weekdays`: only days whose ISO weekday (1 = Mon … 7 = Sun) is in `habit_schedule_days` are scheduled. At least one weekday is required.
- `weekly_target`: `target_per_week` ∈ 1..7. Any day of the week may be completed. The unit of evaluation is the ISO week.
- Scheduling never applies before `start_date`. Scheduled days are evaluated against the habit's *current* schedule. Completions stored for days that are no longer scheduled are kept but ignored for streak and completion-rate calculations.

**Pending vs missed**
- `daily` / `weekdays`: a scheduled day D is **completed** if a completion exists, **pending** if D == today (user tz) and incomplete, and **missed** if D < today and incomplete. Future days are **upcoming**, not counted anywhere.
- `weekly_target`: the current ISO week is **pending** until it ends (Sunday 23:59:59.999 in user tz), even if it is behind target. A past week is **met** if its completion count ≥ `target_per_week`, otherwise **missed**. An in-progress week is never treated as failed.
- The first week of a `weekly_target` habit is evaluated against `target_per_week` only if `start_date` is a Monday. Otherwise the partial first week is excluded from streaks and rates.

**Streaks** (derived from completion history on read, not stored; recomputed automatically after historical edits)
- `daily` / `weekdays`: current streak = number of consecutive *scheduled* days completed, counting back from today. If today is scheduled and still pending, counting starts from the previous scheduled day, so a pending today never breaks the streak. Unscheduled days are skipped and never break it.
- `weekly_target`: the streak is counted in **weeks**. Current streak = consecutive met weeks counting back from the last completed week, plus 1 if the current week has already met its target. The pending current week never breaks it.
- Longest streak = the maximum run over the full history using the same rules.
- Completion rate = completed scheduled instances / total scheduled instances in the period (past and today only). A denominator of 0 returns `null`, and the UI shows an empty state.

**Completable-date rules** (`PUT /habits/:id/completions/:date`)
- `date` must be a valid `YYYY-MM-DD`, otherwise 400.
- `start_date ≤ date ≤ today (user tz)`. Future date or a date before the start → 422 `DATE_NOT_COMPLETABLE`.
- For `weekdays` habits the date must be a scheduled weekday, otherwise 422 `DATE_NOT_SCHEDULED`.
- The habit must be `active`. Archived → 409 `HABIT_ARCHIVED`. History of archived habits is read-only.
- PUT is idempotent: 201 when created, 200 when it already exists. DELETE is idempotent: 204 whether or not a row existed.
- `completed_by` = the authenticated user. `completed_at` = server `now()` in UTC.

**Retention policy**
- `DELETE /habits/:id` **archives** by default: `status = 'archived'`, `archived_at = now()`. History stays queryable, and analytics can include archived habits through a filter.
- `DELETE /habits/:id?permanent=true` hard-deletes and is only allowed when the habit is already archived, otherwise 409 `HABIT_NOT_ARCHIVED`. It removes the habit, its schedule days and its completions in one transaction (FKs are `ON DELETE CASCADE`), leaving no orphans.
- Restoring (`PATCH status: 'active'`) counts against the plan's active-habit limit.
- Notifications older than 90 days are purged by a cron job.
- Account deletion is out of first-release scope. When it is added, it must cascade through the user's personal workspace.

**Workspaces / authorization**
- Each user gets a `personal` workspace (role `owner`) at signup, in the same transaction that creates the user.
- The active workspace comes from the `X-Workspace-Id` header. If the header is absent, the user's personal workspace is used. If the user is not a member of that workspace → 403 `WORKSPACE_FORBIDDEN`. Malformed ID → 400.
- Every query for workspace-scoped data filters by the active `workspace_id`. A resource that exists in another workspace or belongs to another user returns **404 `NOT_FOUND`** (never leak existence).

**Plans / entitlements**
- The `plans` table holds `code` (`free`, `pro`), `name` and `limits` JSONB (e.g. `{ "max_active_habits": 10 }`). It is seeded by a seeder, and limits are never hard-coded in services.
- A workspace without an active row in `workspace_subscriptions` uses the `free` plan.
- Creating or restoring a habit beyond `max_active_habits` → 403 `PLAN_LIMIT_REACHED`.

---

## 4. Backend structure

```
routes -> validators (Zod) -> controllers (HTTP only) -> services (business logic, transactions) -> models
```

- **routes/**: path + middleware wiring only.
- **validators/**: Zod schemas for `body`, `params` and `query`, applied by a shared `validate()` middleware. Validation failure → 400 `VALIDATION_ERROR` with `details`.
- **controllers/**: read the validated input, call one service, and shape the HTTP response. **Controllers never query the DB directly** and never import models.
- **services/**: all business logic, authorization checks beyond membership, and transactions (`sequelize.transaction`) for multi-record writes. Services throw typed `AppError`s and know nothing about `req` or `res`.
- **models/**: Sequelize models and associations only. Schema changes go through **migrations** (`sequelize-cli`), never `sync()` outside tests.
- **middleware/**: auth (session resolution), csrf, workspace resolution, rate limiting, request logging, and the central error handler.
- **jobs/**: node-cron jobs (session purge, notification generation and purge).
- **config/**: environment parsing (validated with Zod at startup; fail fast) and the Sequelize config.
- `app.js` builds the Express app (testable without listening). `server.js` starts it.

Database conventions: UUID primary keys, snake_case tables and columns (`underscored: true`), `created_at`/`updated_at` TIMESTAMPTZ, FKs with explicit `ON DELETE` behaviour, CHECK constraints for enums (`frequency_type`, weekday 1–7, `target_per_week` 1–7), and indexes on `workspace_id`, `habit_id`, `completion_date`, `(user_id, read_at)`.

---

## 5. API conventions

- All routes are prefixed `/api/v1`.
- **Success:** a single JSON resource, or `{ "data": [...], "meta": { "page", "limit", "total" } }` for collections.
- **Error:** `{ "error": { "code": "SCREAMING_SNAKE", "message": "Human readable", "details": <optional> } }`. Never return stack traces or internal messages for 500s.
- **Status codes:** 200 OK · 201 Created · 204 No Content · 400 malformed/validation · 401 unauthenticated · 403 forbidden (CSRF, workspace, plan limit) · 404 not found/not yours · 409 conflict (duplicate email, state conflict) · 422 well-formed but violates a business rule · 429 rate limited · 500 unexpected.
- **Pagination:** `?page=1&limit=20`. `page` ≥ 1, `limit` 1–100 (default 20). Values over 100 → 400.
- **Date ranges:** `?from=YYYY-MM-DD&to=YYYY-MM-DD`, inclusive, `from ≤ to`, span ≤ 366 days, otherwise 400.
- Field names in JSON are camelCase. DB columns are snake_case.
- Endpoint list: see PRD §9. Deferred: invitations, team management, subscriptions, billing.

---

## 6. Coding standards

- ES modules (`"type": "module"`), `async/await` only, no callbacks or `.then` chains.
- No unhandled promises: every promise is awaited or explicitly handled. Express async errors are forwarded to the central error handler. `process.on('unhandledRejection')` logs and exits.
- Logging with pino only (no `console.log` in committed code). **Never log secrets, passwords, session tokens, CSRF tokens, cookies or `Authorization` headers.** Configure pino `redact` accordingly.
- Secrets come only from environment variables. Commit `.env.example` files only.
- **Every endpoint has tests**, including authorization tests: unauthenticated → 401, another user's or another workspace's resource → 404/403, and missing CSRF → 403. Date-boundary tests (timezone edges, week edges, DST) are required for any time-dependent logic.
- Backend tests run against `habitflow_test` and never `habitflow_dev`.
- Formatting follows `.editorconfig` (2 spaces, LF, UTF-8).
- No silent TODOs. Any `TODO` must reference a tracked item and be listed in the phase summary.

---

## 7. Commands

| Purpose | Command |
|---|---|
| Start Postgres (dev + test DBs) | `docker compose up -d` |
| Check Postgres health | `docker compose ps` |
| List databases | `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "\l habitflow_*"'` |
| Stop Postgres | `docker compose down` |
| Reset Postgres (**destroys data**) | `docker compose down -v` |
| Install backend deps | _(added in a later phase)_ |
| Run backend dev server | _(added in a later phase)_ |
| Run migrations / seeders | _(added in a later phase)_ |
| Backend lint / tests | _(added in a later phase)_ |
| Frontend dev / lint / tests | _(added in a later phase)_ |
| E2E tests (Playwright) | _(added in a later phase)_ |

---

## 8. Definition of done (every phase)

- [ ] Lint passes.
- [ ] All tests pass (unit, integration and any E2E touched by the phase).
- [ ] CLAUDE.md is updated: commands, decisions, structure and anything that changed.
- [ ] No TODOs left silently. Every remaining TODO is listed in the phase summary.
- [ ] New decisions are recorded in `docs/DECISIONS.md`.

---

## 9. Phase log

| Phase | Summary |
|---|---|
| 0 | Repository scaffold, docker-compose Postgres 16 (dev + test DBs), CLAUDE.md, DECISIONS.md, README. No feature code. Verified: `docker compose up -d` → healthy; both DBs exist. §3.1 rules approved. |
