# Architecture Decision Records

Short ADR log. Each entry: decision → rationale. Full detail of rules lives in [CLAUDE.md](../CLAUDE.md) §3.
Add new entries at the bottom; never rewrite an accepted decision. Supersede it with a new entry instead.

| # | Decision | Rationale | Status |
|---|---|---|---|
| ADR-001 | **Stack:** React (Vite) + TanStack Query + Tailwind / Node 20 + Express + PostgreSQL 16 + Sequelize, with Jest/Supertest, Vitest/RTL and Playwright. | Matches PRD §10. Mainstream, well-supported tools keep the first release simple. | Accepted |
| ADR-002 | **Auth = server-side sessions** with an opaque random token in an HttpOnly+Secure+SameSite=Lax cookie. Only the SHA-256 hash is stored. Logout deletes the row. The same token is accepted as a Bearer header. | Sessions can be revoked instantly (unlike JWT), a DB leak exposes no usable tokens, and the Bearer fallback serves the future mobile client. | Accepted |
| ADR-003 | **CSRF = double-submit cookie** (`csrf_token` cookie + `X-CSRF-Token` header) on all non-GET cookie-authenticated requests. | Cookie auth needs CSRF protection. Double-submit is stateless and simple for an SPA. | Accepted |
| ADR-004 | **Time:** TIMESTAMPTZ in UTC, calendar dates as DATEONLY `YYYY-MM-DD`, and "today" computed in the user's IANA timezone via Luxon. Server local time is never used. | Habits are calendar-day concepts. Server-local time causes off-by-one-day bugs across timezones. | Accepted |
| ADR-005 | **Completion uniqueness = UNIQUE(habit_id, completed_by, completion_date).** | Enforces one completion per day in the DB, not just the app. Including `completed_by` keeps the model ready for shared habits. | Accepted |
| ADR-006 | **Weeks = ISO weeks (Mon–Sun) in the user's timezone.** | One unambiguous definition for weekly targets, summaries and streaks. | Accepted |
| ADR-007 | **Streaks are derived from completion history on read.** Only scheduled days count. A pending today or in-progress week never breaks a streak. Weekly-target streaks are counted in weeks. | Satisfies the PRD rules: no punitive feedback, and historical edits recalculate automatically without stale cached values. | Accepted |
| ADR-008 | **Pending vs missed:** a day or week is pending until it ends in the user's timezone, then becomes missed if incomplete. | PRD §7: don't treat an in-progress period as failed. | Accepted |
| ADR-009 | **Completable dates:** `start_date ≤ date ≤ today`, the date must be scheduled for weekday habits, and the habit must be active. PUT and DELETE are idempotent. | Prevents future or invalid completions while allowing honest backfill. Idempotency makes retries and double-clicks safe. | Accepted |
| ADR-010 | **Retention:** DELETE archives by default. Permanent delete is allowed only for archived habits and cascades in one transaction. | Archiving preserves history (PRD §7). The two-step hard delete prevents accidental data loss and orphans. | Accepted |
| ADR-011 | **Active workspace via `X-Workspace-Id`**, defaulting to the personal workspace. Another workspace's resources → 404. | Workspace isolation from day one (PRD §2) with no extra work for single-user clients. 404 avoids leaking that a resource exists. | Accepted |
| ADR-012 | **Free plan = 10 active habits**, with limits stored in the `plans` table (JSONB) rather than code. | Entitlements can change without a deploy, and the model is ready for paid tiers. Billing is deferred. | Accepted |
| ADR-013 | **Layered backend:** routes → Zod validators → controllers (HTTP only) → services (logic + transactions) → models. | Keeps business logic testable and HTTP-agnostic, and gives one place for transactions and authorization. | Accepted |
| ADR-014 | **API conventions:** `/api/v1`, `{ data, meta }` collections, `{ error: { code, message, details? } }` errors, page limit ≤ 100, date ranges ≤ 366 days. | A consistent contract for web and mobile, with bounded queries that protect the DB. | Accepted |
| ADR-015 | **Schema changes via sequelize-cli migrations only.** UUID PKs, snake_case columns. | PRD §8: no automatic production schema alteration. UUIDs are safe to expose and distribute. | Accepted |
| ADR-016 | **Local Postgres via Docker Compose** with `habitflow_dev` and `habitflow_test` created by an init script. Credentials come from `.env`. | Reproducible setup. Tests never touch dev data, and no secrets live in git. | Accepted |
