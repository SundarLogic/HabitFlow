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
| Backend | Node ≥ 20 (exact LTS pin pending), Express 5, PostgreSQL 16, Sequelize + sequelize-cli (pg, pg-hstore), Zod 4, Luxon, bcrypt, pino + pino-http, helmet, cors, cookie-parser, express-rate-limit, dotenv, node-cron |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend), Playwright (E2E) |
| Backend tooling | nodemon, ESLint (flat config: @eslint/js, globals, eslint-config-prettier), Prettier, cross-env |
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
- Token: 32 bytes from `crypto.randomBytes`, base64url. Cookie name `hf_session` (HttpOnly, SameSite=Lax, Path=/, Secure when `COOKIE_SECURE`). Only `sha256(token)` is stored in `sessions.token_hash` (unique), along with `user_id`, `expires_at`, `last_used_at`, `created_at`, `user_agent`, `ip`.
- Session lifetime = `SESSION_TTL_DAYS` (default 30), **sliding**: when a session is used and `last_used_at` is ≥ 5 minutes old, both `last_used_at` and `expires_at` move forward and the cookie is re-sent (ADR-031). Expired sessions are rejected and deleted on use, and purged by `runSessionCleanup` (node-cron schedule in Phase 7).
- `Authorization: Bearer <token>` is accepted as an alternative to the cookie. The cookie wins if both are sent. **CSRF checks apply only to cookie-authenticated requests**, not Bearer.
- Passwords: 8–128 characters with at least one letter and one number (Unicode-aware). Stored as `bcrypt(base64(sha256(password)))` with cost 12 (ADR-030); always use `utils/password.js`. Login failures return a generic 401 `INVALID_CREDENTIALS` and do not reveal whether the email exists: bcrypt runs against a dummy hash for unknown emails. A wrong current password on password change or account deletion → 422 `INVALID_CURRENT_PASSWORD`.
- Emails are trimmed and lowercased (validator, model setter and DB CHECK).
- Rate limits (ADR-033): signup and login share 10 requests per 15 min per IP + email. All of `/api` allows 300 per 15 min per IP. Over the limit → 429 `RATE_LIMITED`.
- `csrf_token` cookie: random, **not** HttpOnly (the SPA must read it), SameSite=Lax, Secure in production. It is rotated at signup and login, and `GET /auth/csrf` issues or refreshes it. The server compares it to the `X-CSRF-Token` header in constant time. Mismatch → 403 `CSRF_TOKEN_INVALID`. Signup and login are not CSRF-checked (ADR-034).
- Password change revokes every **other** session of the user, keeping the current one.

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
- The first week of a `weekly_target` habit is **prorated** (ADR-038, superseding the original "excluded unless it starts on Monday" rule): its target is `min(target_per_week, days from start_date to Sunday)`.
- Day status for `weekly_target`: `completed` if done that day **or** the week already met its target; otherwise `pending` while the week runs, then `missed` (ADR-040). Full rules and examples: [docs/STREAK_RULES.md](docs/STREAK_RULES.md).

**Streaks** (derived from completion history on read, not stored; recomputed automatically after historical edits)
- `daily` / `weekdays`: current streak = number of consecutive *scheduled* days completed, counting back from today. If today is scheduled and still pending, counting starts from the previous scheduled day, so a pending today never breaks the streak. Unscheduled days are skipped and never break it.
- `weekly_target`: the streak is counted in **weeks**. Current streak = consecutive met weeks counting back from the last completed week, plus 1 if the current week has already met its target. The pending current week never breaks it.
- Longest streak = the maximum run over the full history using the same rules.
- Completion rate = completed scheduled instances / total scheduled instances in the period (past and today only). A denominator of 0 returns `null`, and the UI shows an empty state.

**Completable-date rules** (`PUT /habits/:id/completions/:date`)
- `date` must be a valid `YYYY-MM-DD`, otherwise 422 `VALIDATION_ERROR`.
- `start_date ≤ date ≤ today (user tz)`. Future date or a date before the start → 422 `DATE_NOT_COMPLETABLE` with `details.reason` `DATE_IN_FUTURE` / `BEFORE_START_DATE` (ADR-039).
- For `weekdays` habits the date must be a scheduled weekday, otherwise 422 `DATE_NOT_SCHEDULED`.
- The habit must be `active`. Archived → 409 `HABIT_ARCHIVED`. History of archived habits is read-only.
- PUT is idempotent: 201 when created, 200 when it already exists. DELETE is idempotent: 204 whether or not a row existed.
- `completed_by` = the authenticated user. `completed_at` = server `now()` in UTC.
- Implementation: `INSERT … ON CONFLICT DO NOTHING RETURNING` + SELECT, inside a transaction holding `FOR SHARE` on the habit (race-safe; 5 concurrent PUTs → one row). An optional `note` (≤ 280) on an existing completion updates it.

**Retention policy**
- `DELETE /habits/:id` **archives** by default: `status = 'archived'`, `archived_at = now()`. History stays queryable, and analytics can include archived habits through a filter.
- `DELETE /habits/:id?permanent=true` hard-deletes and is only allowed when the habit is already archived, otherwise 409 `HABIT_NOT_ARCHIVED`. It removes the habit, its schedule days and its completions in one transaction (FKs are `ON DELETE CASCADE`), leaving no orphans.
- Restoring (`PATCH status: 'active'`) counts against the plan's active-habit limit.
- Notifications older than 90 days are purged by a cron job.
- Account deletion (`DELETE /users/me`, password re-typed) deletes the personal workspace (cascading its data) and then the user, in one transaction. If the user still owns a team workspace or has history in another workspace, RESTRICT FKs roll it back → 409 `RESOURCE_IN_USE` (ADR-032).

**Workspaces / authorization**
- Each user gets a `personal` workspace (role `owner`) at signup, in the same transaction that creates the user.
- The active workspace comes from the `X-Workspace-Id` header. If the header is absent, the user's personal workspace is used. If the user is not a member of that workspace, or it doesn't exist → **404 `NOT_FOUND`** (ADR-029, superseding 403 `WORKSPACE_FORBIDDEN`). Malformed ID → 422 `VALIDATION_ERROR`. A member whose role is not allowed (`requireRole`) → 403 `INSUFFICIENT_ROLE`.
- Signup creates, in one transaction: user → personal workspace `"<name>'s Habits"` → owner membership → `active` subscription on `free` → first session.
- Every query for workspace-scoped data filters by the active `workspace_id`. A resource that exists in another workspace or belongs to another user returns **404 `NOT_FOUND`** (never leak existence).

**Plans / entitlements**
- The `plans` table holds `code` (`free`, `pro`), `name`, `limits` JSONB (`{ "maxActiveHabits": 10, "historyDays": null }`, `null` = unlimited) and `features` JSONB. It is seeded by a seeder, and limits are never hard-coded in services. `pro` is active but `features.purchasable = false` until billing exists (ADR-026).
- A workspace without an active row in `workspace_subscriptions` uses the `free` plan.
- Creating or restoring a habit beyond `limits.maxActiveHabits` → 403 `PLAN_LIMIT_REACHED` with `details: { limit, current }`. Enforced by `entitlementService.assertCanCreateActiveHabit(workspace, { transaction })`, which locks the workspace row so concurrent requests can't exceed the limit (ADR-036). Archived habits don't count.

**Habit management** (ADR-035, ADR-037)
- JSON fields: `name`, `description`, `category`, `color` (`#RRGGBB`), `icon`, `frequencyType`, `weekdays` (ISO 1–7, unique, non-empty; only for `weekdays`, otherwise `null` in responses), `targetPerWeek` (1–7; only for `weekly_target`), `startDate`, `status`, `archivedAt`, `sortOrder`. Empty optional strings become `null`.
- `startDate` defaults to today in the user's timezone. Past dates are allowed (backfill); dates more than 1 year after today → 422.
- The cross-field schedule rules live in one pure function, `habitStateIssues()` (validators/habitValidators.js). Create runs it in Zod. PATCH runs it in `habitService` on the body **merged** with the stored habit. Fields not sent carry over only while `frequencyType` is unchanged: leaving `weekly_target` clears `targetPerWeek`, and leaving `weekdays` deletes the schedule days.
- PATCH `status` archives or restores. While archived, only `name` / `description` may change unless the same request restores the habit → otherwise 409 `HABIT_ARCHIVED` with `details.fields`.
- Archive and unarchive are idempotent. New habits get `sortOrder = max + 1`. List order: `sortOrder`, then `createdAt`, then `id`.
- `PATCH /habits/reorder { items: [{ id, sortOrder }] }` is all-or-nothing: any id not in the workspace → 404 and nothing changes.
- Scheduling is decided by `domain/schedule.js` `isScheduledOn(habit, scheduleDays, isoDate)` (pure; never before `startDate`).

---

## 4. Backend structure

```
routes -> validators (Zod) -> controllers (HTTP only) -> services (business logic, transactions) -> models
```

- **routes/**: path + middleware wiring only. `routes/index.js` mounts every router under `/api/v1`.
- **validators/**: Zod schemas for `body`, `params` and `query`, applied by `validate({ body, params, query })` (`middleware/validate.js`). The parsed output (coerced, defaults applied, unknown keys stripped) **replaces** `req.body` / `req.params` / `req.query`. Validation failure → 422 `VALIDATION_ERROR` with `details: [{ location, path, message }]`.
- **controllers/**: read the validated input, call one service, and shape the HTTP response. **Controllers never query the DB directly** and never import models.
- **services/**: all business logic, authorization checks beyond membership, and transactions (`sequelize.transaction`) for multi-record writes. Services throw typed `AppError`s and know nothing about `req` or `res`. Workspace-scoped services take the workspace id first and always query by `(id, workspaceId)` together. Current services: `auth`, `user`, `workspace`, `entitlement`, `habit`, `completion`, `today`, `streak` (loads completions for many habits in **one** query; never query per habit in a loop), `health`.
- **domain/**: pure business rules with no DB, HTTP or clock access, unit-tested directly. `dates.js` (`todayIn(tz, now)`, `isValidIsoDate`, `isoWeekday`, `addToDate`, `addDays`, `daysBetween`, `weekBounds`, `eachDay`), `schedule.js` (`isScheduledOn`) and `streaks.js` (`computeStreak`, `dayStatus`, `weekProgress`, `weekTarget`). Rules: [docs/STREAK_RULES.md](docs/STREAK_RULES.md). Calendar dates are `'YYYY-MM-DD'` strings, compared as strings.
- **models/**: Sequelize models and associations only. `models/index.js` creates the shared `sequelize` instance and exports every model (`import { sequelize, User, Habit } from '../models/index.js'`). One class per file with `static initModel(sequelize)` and `static associate(models)`; index.js inits all, then associates all. `constants.js` holds the allowed enum values. Model validators mirror the DB CHECKs. `User`'s default scope excludes `passwordHash`; only login code uses `User.scope('withPassword')`, and `toJSON()` always strips it. Schema changes go through **migrations** (`sequelize-cli`), never `sync()` outside test setup helpers. Schema reference: [docs/ERD.md](docs/ERD.md).
- **middleware/**: `requestLogger` (pino-http + X-Request-Id), `validate`, `errorHandler` (+ `notFoundHandler`), `rateLimit` (`createRateLimiter`, `createAuthRateLimiter` → 429 via the error handler), `auth` (`requireAuth`), `csrf` (`csrfProtection`), `workspace` (`resolveWorkspace`, `requireRole`). See "Auth flow" below for the order.
- **serializers/**: the only way models leave the API. `toPublicUser(user)` (allow-list, never a hash), `toPublicWorkspace(workspace, role)`, `toPublicHabit(habit)` (needs `scheduleDays` loaded) and `toPublicCompletion(completion)`. Controllers never `res.json()` a model instance.
- **jobs/**: node-cron jobs (session purge, notification generation and purge).
- **config/**:
  - `env.js`: loads `backend/.env`, validates every variable with Zod and exits with a readable message if anything is invalid. Import `env` from here; never read `process.env` elsewhere in app code.
  - `database.cjs`: the single DB config shared by sequelize-cli and the app (development / test / production).
  - `logger.js`: the pino logger and its redaction paths.
  - `auth.js`: cookie/header names, session TTL and touch interval, bcrypt cost, rate limits.
- **utils/**: `AppError.js` (typed errors), `clock.js` (the injectable `now()`), `tokens.js` (random tokens, `hashToken`, constant-time `safeEqual`), `password.js` (`hashPassword` / `verifyPassword`), `cookies.js` (set/clear the auth cookies with the right flags).
- `app.js` exports `createApp({ db, logger, now, rateLimits })` and never listens, so tests inject fakes. Middleware reads the clock from `req.app.locals.now`. Rate limiters and the API router (`createApiRouter`) are built per app, so tests don't share limiter counters. `server.js` listens and handles graceful shutdown: on SIGTERM/SIGINT it closes the HTTP server, then the DB pool, and force-exits after 10 s. `unhandledRejection` and `uncaughtException` log at fatal level and exit 1.

**Async errors:** we rely on **Express 5 native async error handling**. A rejected promise or a throw in an `async` handler is forwarded to the error handler automatically. Do not add an `asyncHandler` wrapper.

**Errors:** throw `AppError` subclasses from services and middleware. Each fixes the status, while `code` and `details` can be overridden, e.g. `new ConflictError('Email already registered', { code: 'EMAIL_TAKEN' })`.

| Class | Status | Default code |
|---|---|---|
| `BadRequestError` | 400 | `BAD_REQUEST` |
| `UnauthorizedError` | 401 | `UNAUTHENTICATED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `ValidationError` | 422 | `VALIDATION_ERROR` (pass a specific code for business rules, e.g. `DATE_NOT_COMPLETABLE`) |
| `RateLimitedError` | 429 | `RATE_LIMITED` |

The central error handler maps everything else as follows:

| Thrown | Response |
|---|---|
| Sequelize `UniqueConstraintError` | 409 `UNIQUE_VIOLATION`, `details.fields` (field names only, never values) |
| `ForeignKeyConstraintError` on insert/update (missing parent) | 422 `INVALID_REFERENCE` |
| `ForeignKeyConstraintError` on delete (row still referenced) | 409 `RESOURCE_IN_USE` |
| Sequelize `ValidationError` | 422 `VALIDATION_ERROR` |
| Invalid JSON body | 400 `INVALID_JSON` |
| Body over 100 kb | 413 `PAYLOAD_TOO_LARGE` |
| Unknown route | 404 `NOT_FOUND` |
| Anything else | 500 `INTERNAL_ERROR`, "Internal server error" |

A `stack` field is added to 500 responses only when `NODE_ENV=development`.

**Migrations and seeders** live in `src/migrations` and `src/seeders` and **must use the `.cjs` extension**, because the package is `"type": "module"` and sequelize-cli loads them with `require()`. `migration:generate` creates `.js` files, so rename them to `.cjs`.
- Always run the CLI through `npm run sequelize -- <command>`. It passes `--options-path .sequelizerc.cjs`; a plain `npx sequelize-cli` will not find our config.
- Seeders are not recorded, so each one must be **idempotent** (upsert / `ON CONFLICT`).

Database conventions: UUID primary keys (`gen_random_uuid()` from pgcrypto, enabled by the first migration), snake_case tables and columns (`underscored: true`), `created_at`/`updated_at` TIMESTAMPTZ with `DEFAULT now()`, FKs with explicit `ON DELETE` behaviour (ADR-025), enum-like columns as `VARCHAR` + CHECK, never native `ENUM` (ADR-024), and indexes on `workspace_id`, `habit_id`, `completion_date`, `(user_id, read_at)`. Full list: [docs/ERD.md](docs/ERD.md).
- One migration per table. Each runs in a transaction and **names every constraint and index** (`<table>_<rule>`), so a DB error says which rule failed.
- A CHECK on a nullable column must handle NULL explicitly: a CHECK that evaluates to NULL **passes** (e.g. `target_per_week IS NOT NULL AND target_per_week BETWEEN 1 AND 7`).
- Seeders: `*-plans.cjs` runs everywhere (upsert on `code`). `*-demo-data.cjs` runs only in development, throws in production and is a no-op in test (ADR-028). Demo login: `demo@habitflow.local` / `habitflow-demo`.

### 4.1 Auth flow

**Middleware order on a protected route:**
`/api` rate limit → `requireAuth` → `csrfProtection` (unsafe methods only) → `resolveWorkspace` (workspace-scoped routes) → `requireRole(...)` (when needed) → `validate(...)` → controller.
CSRF runs before validation so a forged request learns nothing from validation messages.

| Step | What happens |
|---|---|
| Signup `POST /auth/signup` | Auth limiter → validate → bcrypt (outside the transaction) → transaction: user, personal workspace, owner membership, free subscription, session → `hf_session` + fresh `csrf_token` cookies → 201 `{ user }`. |
| Login `POST /auth/login` | Auth limiter → validate → bcrypt compare (dummy hash if the email is unknown) → `last_login_at` + new session → both cookies (CSRF rotated) → 200 `{ user }`. |
| Each request | `requireAuth`: token from `hf_session`, else `Bearer` → `sha256` → session lookup with user → expired? delete + 401 → touch if ≥ 5 min (re-send cookie) → sets `req.user`, `req.session`, `req.authMethod`. |
| Unsafe request | `csrfProtection`: cookie auth needs `X-CSRF-Token` == `csrf_token` cookie (constant time), else 403 `CSRF_TOKEN_INVALID`. Bearer is exempt. |
| Workspace | `resolveWorkspace`: `X-Workspace-Id` (UUID, else 422) or the personal workspace → membership lookup → 404 if none → sets `req.workspace`, `req.membership.role`. |
| Logout `POST /auth/logout` | Deletes this session row (immediate revocation), clears both cookies, 204. |
| Password change | Verify the current password → new hash + delete all other sessions in one transaction → 204. |
| Account deletion | Verify the password → transaction: delete personal workspace (cascade), then user → clear cookies → 204. |
| Cleanup | `jobs/sessionCleanup.js` `runSessionCleanup()` deletes sessions with `expires_at ≤ now` (scheduled nightly in Phase 7). |

**SPA bootstrap:** `GET /auth/csrf` (gets a CSRF cookie) → `GET /auth/me` (401 = show login) → send `X-CSRF-Token` with the `csrf_token` cookie value on every non-GET request, plus `credentials: 'include'`.

**Implemented endpoints:**
- Phase 3: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/csrf`, `GET /workspaces`, `PATCH /users/me`, `PATCH /users/me/password`, `DELETE /users/me`.
- Phase 4 (all workspace-scoped: `requireAuth → csrfProtection → resolveWorkspace`):
  - `GET /habits?status=active|archived|all&category&search&page&limit` → `{ data, meta }`
  - `POST /habits` → 201 `{ habit }`
  - `GET /habits/categories` → `{ data: string[] }`
  - `PATCH /habits/reorder` → 204
  - `GET /habits/:id` → `{ habit, streaks: { current, longest, unit, status, weekProgress? } }` (the requesting user's, as of today)
  - `PATCH /habits/:id` → `{ habit }`
  - `DELETE /habits/:id?permanent=true|false` → 204
  - `POST /habits/:id/archive`, `POST /habits/:id/unarchive` → `{ habit }`

  Routes with fixed paths (`/categories`, `/reorder`) are declared before `/:id`. A malformed `:id` → 422.
- Phase 5 (workspace-scoped):
  - `PUT /habits/:id/completions/:date` `{ note? }` → 201 / 200 `{ completion }`
  - `DELETE /habits/:id/completions/:date` → 204
  - `GET /completions?from&to&habitId&page&limit` → `{ data, meta }` (own completions; range required, ≤ 366 days)
  - `GET /today?date` → `{ date, today, habits: [{ habit, completed, completion, status, streak: { current, longest, unit }, weekProgress? }], summary: { scheduled, completed, remaining, percent } }`

---

## 5. API conventions

- All routes are prefixed `/api/v1`.
- **Success:** a single JSON resource, or `{ "data": [...], "meta": { "page", "limit", "total" } }` for collections.
- **Error:** `{ "error": { "code": "SCREAMING_SNAKE", "message": "Human readable", "details": <optional> } }`. Never return stack traces or internal messages for 500s.
- **Status codes:**
  - 200 OK · 201 Created · 204 No Content
  - 400 request can't be parsed (invalid JSON)
  - 401 unauthenticated
  - 403 forbidden (CSRF, insufficient role, plan limit)
  - 404 not found / not yours
  - 409 conflict (duplicate, state conflict, still referenced)
  - 413 body too large
  - 422 validation failed (`VALIDATION_ERROR`) or a business rule was violated (specific code)
  - 429 rate limited · 500 unexpected
- **Pagination:** `?page=1&limit=20`. `page` ≥ 1, `limit` 1–100 (default 20). Out-of-range values → 422.
- **Date ranges:** `?from=YYYY-MM-DD&to=YYYY-MM-DD`, inclusive, `from ≤ to`, span ≤ 366 days, otherwise 422.
- **Request IDs:** every response carries `X-Request-Id`. A safe incoming value (`[A-Za-z0-9._-]{1,128}`) is echoed; otherwise a UUID is generated. The ID appears in every log line for that request.
- **Health:** `GET /api/v1/health` → `200 { status: 'ok', db: 'ok' | 'down', time }`. The database is checked with `SELECT 1` (2 s timeout). The response stays 200 when `db` is `down`: the process is alive and the body tells the caller the rest.
- Field names in JSON are camelCase. DB columns are snake_case.
- Endpoint list: see PRD §9. Deferred: invitations, team management, subscriptions, billing.

---

## 6. Coding standards

- ES modules (`"type": "module"`), `async/await` only, no callbacks or `.then` chains.
- No unhandled promises: every promise is awaited or explicitly handled. Express async errors are forwarded to the central error handler. `process.on('unhandledRejection')` logs and exits.
- Logging with pino only (no `console.log` in committed code). **Never log secrets, passwords, session tokens, CSRF tokens, cookies or `Authorization` headers.** Configure pino `redact` accordingly.
- Secrets come only from environment variables. Commit `.env.example` files only.
- **Every endpoint has tests**, including authorization tests: unauthenticated → 401, another user's or another workspace's resource → 404/403, and missing CSRF → 403. Date-boundary tests (timezone edges, week edges, DST) are required for any time-dependent logic.
- Backend tests run against `habitflow_test` and never `habitflow_dev`. Several guards refuse any database whose name doesn't end in `_test`: `env.js`, `database.cjs` and `truncateAllTables`.
- **Test harness** (`backend/tests/`):
  - `setup/globalSetup.js` runs all migrations once.
  - `setup/setupEnv.js` forces `NODE_ENV=test` and `LOG_LEVEL=silent` unless the shell sets it.
  - `setup/setupAfterEnv.js` closes the pool after each file.
  - Call `truncateAllTables({ except })` from `helpers/db.js` in `beforeEach` of any DB-writing test.
  - Files run serially (`maxWorkers: 1`) because they share one database.
  - `helpers/auth.js`: `createTestApp()` (createApp with relaxed rate limits; rate-limit tests use `createApp()`), `seedPlans()` (call in `beforeAll`, then `truncateAllTables({ except: ['plans'] })`), `signupAgent(app)` / `loginAgent(app, creds)` (a cookie-keeping Supertest agent plus `csrfToken` and `sessionToken`), and `cookieValue(res, name)`.
  - Time-dependent API tests either inject `createTestApp({ now })` or use Jest fake timers faking **only** `Date` (`jest.useFakeTimers({ now, doNotFake: [...all timer APIs] })`), since faked timers would stall the DB driver and Supertest. See `tests/integration/today.test.js`.
  - `helpers/habits.js`: `call(ctx, method, url, body?, headers?)` sends a request with the CSRF header; `createHabitViaApi(ctx, overrides?)` creates a habit through the API.
  - `helpers/factories.js` inserts valid rows (`createUser`, `createUserWithWorkspace`, `createHabit`) so tests only spell out the fields they care about.
  - Build apps with `createApp({ db })` to inject fakes. Use `unit/` for pure logic, `integration/` for HTTP tests, and `db/` for schema, model and seeder tests. To test a DB constraint rather than the model validator in front of it, pass `{ validate: false }` to `create()`.
- Native ESM in Jest: `npm test` sets `NODE_OPTIONS=--experimental-vm-modules`. The `jest` object is not a global under ESM (`describe`, `it` and `expect` are). Import it from `@jest/globals` if needed.
- Formatting follows `.editorconfig` (2 spaces, LF, UTF-8).
- **Comments are written for junior developers.** Every source and test file starts with a header comment saying what the file is for and how it fits the request flow. Exported functions get JSDoc (purpose, params, return). Non-obvious lines get a short comment explaining *why*: security rules, Express/Zod/Sequelize quirks, safety guards. Don't comment what the code already says plainly.
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
| **Backend** (run inside `backend/`) | |
| Install deps | `npm install` |
| Configure env | copy `.env.example` → `.env` (DB_PORT must match the root `POSTGRES_PORT`) |
| Dev server (auto-restart) | `npm run dev` → http://localhost:3000/api/v1/health |
| Production start | `npm start` |
| Tests (migrates test DB first) | `npm test` · watch: `npm run test:watch` · one file: `npm test -- tests/unit/env.test.js` |
| Lint | `npm run lint` |
| Format / check formatting | `npm run format` / `npm run format:check` |
| Migrate dev DB / undo last / undo all | `npm run db:migrate` / `npm run db:migrate:undo` / `npm run db:migrate:undo:all` |
| Seed dev DB (idempotent: plans + demo data) | `npm run db:seed` → log in as `demo@habitflow.local` / `habitflow-demo` |
| Reset **test** DB (undo all, migrate, seed) | `npm run db:reset` |
| Any other sequelize-cli command | `npm run sequelize -- <command>`, e.g. `npm run sequelize -- migration:generate --name create-users` (then rename the file to `.cjs`) |
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
| 1 | Backend foundation: Zod-validated env, shared DB config, sequelize-cli wiring (.cjs), app/server split with graceful shutdown, helmet/cors/json/cookie-parser, pino-http with request IDs and redaction, validate(), AppError family, central error handler + 404, rate-limiter factory, `GET /api/v1/health`, Jest ESM harness (migrate once, truncate helper), ESLint + Prettier. 46 tests passing. No feature endpoints. |
| 2 | Database schema: 11 migrations (users, sessions, plans, workspaces, workspace_members, workspace_subscriptions, habits, habit_schedule_days, habit_completions, habit_reminders, notifications) with named CHECK/UNIQUE constraints, partial unique index (one personal workspace per owner) and access-path indexes. 11 models + associations, User password scopes. Seeders: plans (free = 10 active habits, pro unlimited and not purchasable) and dev-only demo data. Test factories and `tests/db/` (constraints, cascades, model scopes/associations, seeders). docs/ERD.md. ADR-024 to ADR-028. Verified: migrate → undo:all → migrate on a fresh DB, seeders idempotent, 88 tests passing. No endpoints. |
| 3 | Authentication and workspace authorization: authService (signup transaction, constant-time login, sessions with sliding expiry, logout/logoutAll, expired-session purge), userService (profile, password change revoking other sessions, account deletion), workspaceService (active workspace, listing, plan lookup). Middleware: requireAuth (cookie or Bearer), csrfProtection, resolveWorkspace (404 for non-members), requireRole, IP+email auth rate limiter and general /api limiter. Endpoints: auth signup/login/logout/me/csrf, GET /workspaces, PATCH/DELETE /users/me, PATCH /users/me/password. `toPublicUser` serializer, `runSessionCleanup` job (not yet scheduled). ADR-029 to ADR-034. 174 tests passing. Follow-ups: schedule the cleanup job (Phase 7); set Express `trust proxy` before deploying behind a proxy, so rate limits see client IPs. |
| 4 | Habit management: `domain/` (pure `dates.js`, `schedule.js` `isScheduledOn`), `habitValidators.js` (field rules + shared cross-field `habitStateIssues`), `entitlementService` (plan limit with a workspace row lock), `habitService` (list/filter/search/paginate, get, create, merged-state update, archive/unarchive, archive-or-permanent delete, reorder, categories), `toPublicHabit` serializer, 9 `/habits` endpoints. ADR-035 to ADR-037. 295 tests passing (the concurrency test was confirmed to fail without the lock). Follow-up: streaks on `GET /habits/:id` are `null` placeholders until Phase 5. |
| 5 | Completions and streaks: pure `domain/streaks.js` (day/week streaks, pending vs missed, prorated first week, day status, week progress) with 51 hand-written cases plus a randomized cross-check against a naive reference implementation (600 histories; confirmed to catch planted bugs). `completionService` (race-safe idempotent mark, idempotent unmark, history), `todayService` (dashboard in two queries, verified by a query-counting test), real streaks on `GET /habits/:id`. Endpoints: PUT/DELETE completions, GET /completions, GET /today. docs/STREAK_RULES.md. ADR-038 to ADR-040. |
