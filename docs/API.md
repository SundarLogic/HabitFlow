# HabitFlow API reference (first release)

The REST/JSON API behind the HabitFlow web app, also usable by the future mobile app. Every path below is relative to **`/api/v1`**. A machine-readable version is in [openapi.yaml](openapi.yaml).

Related documents:

- [CLAUDE.md §3.1](../CLAUDE.md) holds the binding business rules.
- [STREAK_RULES.md](STREAK_RULES.md) explains streaks, statuses and completion rates.
- [ERD.md](ERD.md) describes the database.

The examples use a New York user on **Wednesday 2026-10-28** (except where stated). IDs are shortened to `…` where the full UUID doesn't matter.

**Where the API lives:**

| Environment | Base URL |
|---|---|
| Local | `http://localhost:3000/api/v1`, or `http://localhost:5173/api/v1` through the Vite proxy |
| Production, browser | `https://<your-app>.vercel.app/api/v1`. Vercel forwards `/api/*` to Render, so the browser stays on one origin ([DEPLOYMENT.md](DEPLOYMENT.md)) |
| Production, native apps and scripts | `https://<render-host>/api/v1`, with a Bearer token ([MOBILE_READINESS.md](MOBILE_READINESS.md)) |

**Interactive docs:** Swagger UI at **`/api/docs`** (for example http://localhost:3000/api/docs) shows this API from [openapi.yaml](openapi.yaml), with "Try it out".
- It is served in **development and test only, never in production**.
- GETs work with your login cookie.
- For writes, click **Authorize → bearerAuth** and paste your session token: Bearer requests need no CSRF header.

---

## 1. Conventions

### Authentication

| Client | How |
|---|---|
| Browser (SPA) | Cookies. Log in or sign up, and the server sets `hf_session` (HttpOnly) and `csrf_token`. Send requests with `credentials: 'include'`. |
| Mobile / scripts | `Authorization: Bearer <session token>`. The cookie wins if both are sent. |

**CSRF:** every `POST`/`PUT`/`PATCH`/`DELETE` authenticated by cookie must send the header `X-CSRF-Token: <value of the csrf_token cookie>`. Bearer requests are exempt; signup and login are not checked.

**SPA start-up:** `GET /auth/csrf` → `GET /auth/me` (a 401 means "show the login page").

### Workspaces

Habit, completion, analytics and reminder endpoints act on the **active workspace**. That is your personal workspace, unless you send `X-Workspace-Id: <uuid>` for another workspace you're a member of. A workspace you're not a member of returns 404, and a malformed id returns 422.

### Dates and times

- Calendar dates are `YYYY-MM-DD` in **your** timezone (`users.timezone`).
- Reminder times are `HH:mm` (24-hour), also in your timezone.
- Timestamps (`createdAt`, `completedAt`, …) are ISO-8601 in UTC.
- Weeks are ISO weeks, Monday to Sunday.

### Responses

- **One resource:** wrapped by name, e.g. `{ "habit": { … } }`.
- **Collections:** `{ "data": [ … ], "meta": { "page", "limit", "total" } }`. Pagination uses `?page=1&limit=20`, with `limit` from 1 to 100.
- **Date ranges:** `?from&to`, inclusive, `from ≤ to`, at most 366 days.
- **Rates:** `completionRate` and `rate` are fractions from 0 to 1 (4 decimals); `percent` is an integer from 0 to 100. Both are **`null` when nothing was due**, so show an empty state rather than 0%.

### Errors

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [ { "location": "body", "path": "name", "message": "is required" } ] } }
```

`details` is optional. For `VALIDATION_ERROR` it lists every problem found, each with `location` (`body`, `query`, `params` or `headers`) and a field `path`.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 401 | `UNAUTHENTICATED` | No session, or an expired/revoked one |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password on login (no hint which) |
| 403 | `CSRF_TOKEN_INVALID` | Missing or wrong `X-CSRF-Token` on a cookie request |
| 403 | `PLAN_LIMIT_REACHED` | Too many active habits for the plan (`details: { limit, current }`) |
| 403 | `INSUFFICIENT_ROLE` | Your workspace role doesn't allow the action |
| 404 | `NOT_FOUND` | Unknown route, or a resource that doesn't exist **or isn't yours** |
| 409 | `EMAIL_TAKEN` | Signup with a registered email |
| 409 | `HABIT_ARCHIVED` | Changing an archived habit (completions, most fields, new reminders) |
| 409 | `HABIT_NOT_ARCHIVED` | Permanent delete of an active habit |
| 409 | `REMINDER_DUPLICATE` | A second reminder at the same time for the same habit |
| 409 | `RESOURCE_IN_USE` | Account deletion blocked by data elsewhere |
| 409 | `UNIQUE_VIOLATION` | Any other uniqueness conflict |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 kb |
| 422 | `VALIDATION_ERROR` | Input failed validation (see `details`) |
| 422 | `INVALID_CURRENT_PASSWORD` | Wrong password when changing it or deleting the account |
| 422 | `DATE_NOT_COMPLETABLE` | Completion date in the future or before the start (`details.reason`: `DATE_IN_FUTURE` / `BEFORE_START_DATE`) |
| 422 | `DATE_NOT_SCHEDULED` | Completion on a weekday the habit doesn't run on |
| 422 | `REMINDER_LIMIT_REACHED` | More than 5 reminders for one habit |
| 422 | `REMINDER_WEEKDAYS_NOT_SCHEDULED` | Reminder weekdays outside a weekdays habit's schedule |
| 422 | `INVALID_REFERENCE` | A referenced record doesn't exist |
| 429 | `RATE_LIMITED` | Too many requests (signup/login: 10 per 15 min per IP + email; everything: 300 per 15 min per IP) |
| 500 | `INTERNAL_ERROR` | Unexpected failure (no internal details are returned) |

Every response carries an `X-Request-Id` header; quote it in bug reports.

Every authenticated endpoint can also return `401 UNAUTHENTICATED`, every cookie-authenticated write can return `403 CSRF_TOKEN_INVALID`, and every workspace-scoped endpoint can return a 404 or 422 from `X-Workspace-Id`. These aren't repeated below.

---

## 2. Health

### GET /health

No authentication. Reports whether the API and its database are up. It always returns 200 while the process is alive.

```json
{ "status": "ok", "db": "ok", "time": "2026-10-28T13:00:00.000Z" }
```

`db` is `"down"` when PostgreSQL doesn't answer within 2 seconds.

---

## 3. Auth

### POST /auth/signup

Creates the account, its personal workspace `"<name>'s Habits"` (owner, free plan) and a session, and sets both cookies.

```json
{ "name": "Ana Lima", "email": "Ana@Example.com", "password": "correct-horse-42", "timezone": "America/New_York" }
```

| Field | Rules |
|---|---|
| `name` | 1–100 characters after trimming |
| `email` | Valid email; trimmed and lowercased |
| `password` | 8–128 characters, at least one letter and one number |
| `timezone` | IANA timezone, default `UTC` |

**201**

```json
{ "user": { "id": "3a2fad36-…", "name": "Ana Lima", "email": "ana@example.com", "timezone": "America/New_York",
            "notificationPreferences": { "inApp": true, "reminders": true }, "lastLoginAt": null,
            "createdAt": "2026-10-28T13:00:00.000Z", "updatedAt": "2026-10-28T13:00:00.000Z" } }
```

**Errors:** 409 `EMAIL_TAKEN`, 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`.

### POST /auth/login

`{ "email": "ana@example.com", "password": "correct-horse-42" }` → **200** `{ "user": { … } }`, with new cookies (the CSRF token is rotated).

**Errors:** 401 `INVALID_CREDENTIALS`, 422 `VALIDATION_ERROR`, 429 `RATE_LIMITED`.

### POST /auth/logout

Deletes the current session (other devices stay logged in) and clears both cookies. **204**.

### GET /auth/me

**200**

```json
{
  "user": { "id": "3a2fad36-…", "name": "Ana Lima", "email": "ana@example.com", "timezone": "America/New_York",
            "notificationPreferences": { "inApp": true, "reminders": true }, "lastLoginAt": "2026-10-28T12:58:10.000Z",
            "createdAt": "2026-10-01T09:00:00.000Z", "updatedAt": "2026-10-01T09:00:00.000Z" },
  "workspaces": [ { "id": "cc15dd7f-…", "name": "Ana Lima's Habits", "type": "personal", "role": "owner" } ],
  "activeWorkspaceId": "cc15dd7f-…",
  "plan": { "code": "free", "limits": { "maxActiveHabits": 10, "historyDays": null } }
}
```

Honours `X-Workspace-Id` (`activeWorkspaceId` and `plan` follow it).

### GET /auth/csrf

No authentication. Issues or refreshes the `csrf_token` cookie and returns the same value. **200** `{ "csrfToken": "q1Vb…43 chars" }`.

---

## 4. Account (`/users/me`)

### PATCH /users/me

Any of `name`, `timezone`, `notificationPreferences` (`{ "inApp"?: boolean, "reminders"?: boolean }`, merged with the current values). At least one field is required.

`{ "timezone": "Europe/Lisbon", "notificationPreferences": { "reminders": false } }` → **200** `{ "user": { … } }`

**Errors:** 422 `VALIDATION_ERROR`.

### PATCH /users/me/password

`{ "currentPassword": "correct-horse-42", "newPassword": "brand-new-pass-7" }` → **204**. Every other session is logged out; this one stays.

**Errors:** 422 `INVALID_CURRENT_PASSWORD`, 422 `VALIDATION_ERROR`.

### DELETE /users/me

`{ "password": "correct-horse-42" }` → **204**. Deletes the personal workspace with all its habits and history, then the account, and clears the cookies.

**Errors:** 422 `INVALID_CURRENT_PASSWORD`, 409 `RESOURCE_IN_USE` (you still own a team workspace).

---

## 5. Workspaces

### GET /workspaces?page&limit

**200**

```json
{ "data": [ { "id": "cc15dd7f-…", "name": "Ana Lima's Habits", "type": "personal", "role": "owner" } ],
  "meta": { "page": 1, "limit": 20, "total": 1 } }
```

---

## 6. Habits

### The habit object

```json
{
  "id": "715d6dd1-d210-47c5-9bdf-1c996fbfa999", "workspaceId": "cc15dd7f-…", "createdBy": "3a2fad36-…",
  "name": "Run", "description": null, "category": "Fitness", "color": "#F59E0B", "icon": "running",
  "frequencyType": "weekly_target", "weekdays": null, "targetPerWeek": 2,
  "startDate": "2026-10-05", "status": "active", "archivedAt": null, "sortOrder": 2,
  "createdAt": "2026-10-05T08:00:00.000Z", "updatedAt": "2026-10-05T08:00:00.000Z"
}
```

| Field | Rules |
|---|---|
| `name` | Required, 1–100 characters |
| `description` | Optional, at most 500 characters |
| `category` | Optional, at most 50 characters (`""` becomes `null`) |
| `icon` | Optional, at most 50 characters |
| `color` | Optional, `#RRGGBB` |
| `frequencyType` | `daily` \| `weekdays` \| `weekly_target` |
| `weekdays` | ISO days 1 (Mon) to 7 (Sun), unique and non-empty. **Required** for `weekdays`, forbidden otherwise (`null` in responses). |
| `targetPerWeek` | 1–7. **Required** for `weekly_target`, forbidden otherwise. |
| `startDate` | `YYYY-MM-DD`. Defaults to today; may be in the past, and at most 1 year ahead. |

### GET /habits?status&category&search&page&limit

`status` is `active` (default), `archived` or `all`. `category` is an exact match; `search` is a case-insensitive name substring. Results are ordered by `sortOrder`. **200** `{ "data": [habit], "meta": { "page", "limit", "total" } }`

### POST /habits

```json
{ "name": "Gym", "category": "Fitness", "frequencyType": "weekdays", "weekdays": [1, 3, 5], "startDate": "2026-10-01" }
```

**201** `{ "habit": { … "weekdays": [1, 3, 5], "sortOrder": 3 … } }`

**Errors:** 403 `PLAN_LIMIT_REACHED` (`details: { "limit": 10, "current": 10 }`), 422 `VALIDATION_ERROR`.

### GET /habits/categories

**200** `{ "data": ["Fitness", "Health"] }`

### PATCH /habits/reorder

`{ "items": [ { "id": "…", "sortOrder": 0 }, { "id": "…", "sortOrder": 1 } ] }` → **204**. All-or-nothing: if any id isn't in the workspace the response is 404 and nothing changes.

### GET /habits/:id

The habit plus **your** streak as of today.

```json
{ "habit": { … },
  "streaks": { "current": 1, "longest": 1, "unit": "weeks", "status": "pending", "weekProgress": { "done": 1, "target": 2 } } }
```

`status` is today's status: `completed` \| `pending` \| `missed` \| `not_scheduled` \| `upcoming`. `weekProgress` is present for weekly targets only.

**Errors:** 404 `NOT_FOUND`, 422 (malformed id).

### PATCH /habits/:id

Any subset of the habit fields, plus `status` (`archived` archives, `active` restores). The change is validated against the **merged** result:

- switching to `weekdays` requires `weekdays`;
- leaving `weekly_target` clears `targetPerWeek`.

**200** `{ "habit": { … } }`

**Errors:**

- 409 `HABIT_ARCHIVED`: an archived habit can only change `name` and `description` unless the same request restores it; `details.fields` lists the rejected fields.
- 403 `PLAN_LIMIT_REACHED`: when restoring.
- 422 `VALIDATION_ERROR`.

### DELETE /habits/:id?permanent=false|true

- `permanent=false` (default) **archives** the habit, keeping its history. **204**
- `permanent=true` deletes it for good, with its schedule, completions and reminders. This is only allowed for an archived habit. **204**

**Errors:** 409 `HABIT_NOT_ARCHIVED`, 404.

### POST /habits/:id/archive · POST /habits/:id/unarchive

**200** `{ "habit": { … } }`. Idempotent. Unarchiving can fail with 403 `PLAN_LIMIT_REACHED`.

### GET /habits/:id/history?from&to

Per-day status for the habit calendar. Defaults to the last 30 days.

```json
{ "habitId": "e70a853f-…", "range": { "from": "2026-10-26", "to": "2026-10-29" },
  "data": [ { "date": "2026-10-26", "status": "completed", "completed": true },
            { "date": "2026-10-27", "status": "not_scheduled", "completed": false },
            { "date": "2026-10-28", "status": "pending", "completed": false },
            { "date": "2026-10-29", "status": "upcoming", "completed": false } ] }
```

For an archived habit, days after it was archived are `not_scheduled`, never `missed`.

---

## 7. Completions and the daily overview

### PUT /habits/:id/completions/:date

Marks the habit done on `date`. The optional body `{ "note": "…" }` can be up to 280 characters.

- **201** when created; **200** when the date was already done (if a note is sent, the note is updated). Retries and double-clicks never create duplicates.
- A completion that makes your streak reach **7, 30, 100 or 365** also creates a `streak_milestone` notification (once per streak run).

```json
{ "completion": { "id": "b5625891-…", "habitId": "189c5b89-…", "completedBy": "3a2fad36-…",
                  "completionDate": "2026-10-27", "completedAt": "2026-10-28T13:00:00.000Z", "note": "Late entry" } }
```

**Errors:**

- 404
- 409 `HABIT_ARCHIVED`
- 422 `DATE_NOT_COMPLETABLE`, e.g. `{ "reason": "DATE_IN_FUTURE", "today": "2026-10-28" }` or `{ "reason": "BEFORE_START_DATE", "startDate": "2026-10-01" }`
- 422 `DATE_NOT_SCHEDULED` (`details.weekdays`)
- 422 `VALIDATION_ERROR` (malformed date)

### DELETE /habits/:id/completions/:date

Undoes a completion. **204** whether or not it existed. **Errors:** 404, 409 `HABIT_ARCHIVED`.

### GET /completions?from&to&habitId&page&limit

Your completions in the active workspace, newest first. Archived habits are included. `from` and `to` are **required**.

```json
{ "data": [ { "id": "…", "habitId": "189c5b89-…", "completedBy": "3a2fad36-…", "completionDate": "2026-10-28",
              "completedAt": "2026-10-28T13:00:00.000Z", "note": null } ],
  "meta": { "page": 1, "limit": 20, "total": 14 } }
```

**Errors:** 404 (a `habitId` that isn't yours), 422 (range missing, reversed or over 366 days).

### GET /today?date

The dashboard. Lists every **active** habit scheduled on `date` (default: today), with your completion, status, streak, weekly progress and **due indicator**.

- `isDue` is `true` when the date is today, the habit is still pending, and one of your reminders for it has a time that has already passed today.
- Each `habit` below is abridged; it is the full habit object.

```json
{
  "date": "2026-10-28", "today": "2026-10-28",
  "habits": [
    { "habit": { "id": "189c5b89-…", "name": "Water", "frequencyType": "daily" },
      "completed": true,
      "completion": { "id": "f79d43ef-…", "habitId": "189c5b89-…", "completedBy": "3a2fad36-…",
                      "completionDate": "2026-10-28", "completedAt": "2026-10-28T13:00:00.000Z", "note": null },
      "status": "completed", "isDue": false,
      "streak": { "current": 1, "longest": 5, "unit": "days" } },
    { "habit": { "id": "e70a853f-…", "name": "Gym", "frequencyType": "weekdays", "weekdays": [1, 3, 5] },
      "completed": false, "completion": null, "status": "pending", "isDue": true,
      "streak": { "current": 2, "longest": 2, "unit": "days" } },
    { "habit": { "id": "715d6dd1-…", "name": "Run", "frequencyType": "weekly_target", "targetPerWeek": 2 },
      "completed": false, "completion": null, "status": "pending", "isDue": false,
      "streak": { "current": 1, "longest": 1, "unit": "weeks" },
      "weekProgress": { "done": 1, "target": 2 } }
  ],
  "summary": { "scheduled": 3, "completed": 1, "remaining": 2, "percent": 33 }
}
```

---

## 8. Analytics

How the numbers are counted:

- A **scheduled instance** is a due **day** (daily and weekdays habits) or a due ISO **week** (weekly target; complete when the week's completions reach the target).
- **Completion rate** = completed ÷ scheduled, or `null`.
- Today counts only once it's done, and the current week only once its target is met, so **nothing in progress lowers a rate**.
- Archived habits are history: they're evaluated up to their archive date and left out of `today`.
- `daily` and the heatmap count day-based habits only.
- Streaks are as of today. Details are in [STREAK_RULES.md §8](STREAK_RULES.md).

### GET /analytics/summary?from&to&habitId&includeArchived

Default range: the last 30 days. `habitId` narrows every block (another workspace's habit returns 404); `includeArchived` defaults to `true`.

`GET /analytics/summary?from=2026-10-26&to=2026-10-28` (real output from the test fixture):

```json
{
  "range": { "from": "2026-10-26", "to": "2026-10-28" },
  "today": { "scheduled": 3, "completed": 1, "remaining": 2, "percent": 33 },
  "overall": { "completionRate": 0.75, "completed": 3, "scheduled": 4 },
  "bestStreak": { "habitId": "189c5b89-…", "name": "Water", "longest": 5, "unit": "days" },
  "daily": [
    { "date": "2026-10-26", "scheduled": 2, "completed": 2, "rate": 1 },
    { "date": "2026-10-27", "scheduled": 1, "completed": 0, "rate": 0 },
    { "date": "2026-10-28", "scheduled": 1, "completed": 1, "rate": 1 }
  ],
  "weekly": [ { "weekStart": "2026-10-26", "scheduled": 4, "completed": 3, "rate": 0.75 } ],
  "byHabit": [
    { "habitId": "189c5b89-…", "name": "Water", "category": "Health", "status": "active",
      "completionRate": 0.6667, "completed": 2, "scheduled": 3, "currentStreak": 1, "longestStreak": 5, "unit": "days" },
    { "habitId": "e70a853f-…", "name": "Gym", "category": "Fitness", "status": "active",
      "completionRate": 1, "completed": 1, "scheduled": 1, "currentStreak": 2, "longestStreak": 2, "unit": "days" },
    { "habitId": "715d6dd1-…", "name": "Run", "category": "Fitness", "status": "active",
      "completionRate": null, "completed": 0, "scheduled": 0, "currentStreak": 1, "longestStreak": 1, "unit": "weeks" },
    { "habitId": "56077157-…", "name": "Old", "category": "Health", "status": "archived",
      "completionRate": null, "completed": 0, "scheduled": 0, "currentStreak": 0, "longestStreak": 1, "unit": "days" }
  ],
  "byCategory": [
    { "category": "Health", "completionRate": 0.6667, "completed": 2, "scheduled": 3 },
    { "category": "Fitness", "completionRate": 1, "completed": 1, "scheduled": 1 }
  ]
}
```

Reading this example:

- Gym shows 1/1 because Wednesday is still pending.
- Run's week is running at 1 of 2, so nothing was due yet (`null`).
- Old was archived on the 21st.

**Errors:** 404, 422 (bad range, `habitId` or `includeArchived`).

### GET /analytics/heatmap?year | ?from&to

Every day of the range (default: the current year), including future days with zeros.

```json
{ "range": { "from": "2026-10-26", "to": "2026-10-28" },
  "data": [ { "date": "2026-10-26", "completed": 2, "scheduled": 2 },
            { "date": "2026-10-27", "completed": 0, "scheduled": 1 },
            { "date": "2026-10-28", "completed": 1, "scheduled": 1 } ] }
```

**Errors:** 422 (`year` outside 2000–2100, `year` combined with `from`/`to`, or a bad range).

---

## 9. Reminders

Reminders are **yours**: each user sets their own times for a habit in the active workspace. Every minute, the server creates a `habit_reminder` notification for each reminder whose time is now in your timezone. It skips:

- habits that are archived, not scheduled today, already done today, or (weekly) already at target;
- reminders whose `weekdays` exclude today;
- everything when you switched `reminders` off.

Each reminder is sent at most once per day.

### The reminder object

```json
{ "id": "9c1e…", "habitId": "189c5b89-…", "remindAt": "07:30", "weekdays": null, "enabled": true,
  "createdAt": "2026-10-28T13:00:00.000Z", "updatedAt": "2026-10-28T13:00:00.000Z" }
```

| Field | Rules |
|---|---|
| `remindAt` | `HH:mm`, 24-hour, your timezone |
| `weekdays` | `null` = every scheduled day of the habit; otherwise unique ISO days 1–7. For a weekdays habit, they must be days it runs on. |
| `enabled` | Default `true` |

At most **5** reminders per habit, and one per time.

### GET /habits/:id/reminders

**200** `{ "data": [reminder] }` (yours, earliest first).

### POST /habits/:id/reminders

`{ "remindAt": "07:30", "weekdays": [1, 3, 5], "enabled": true }` → **201** `{ "reminder": { … } }`

**Errors:**

- 404
- 409 `HABIT_ARCHIVED`
- 409 `REMINDER_DUPLICATE`
- 422 `REMINDER_LIMIT_REACHED` (`details.limit`: 5)
- 422 `REMINDER_WEEKDAYS_NOT_SCHEDULED` (`details: { allowed, outside }`)
- 422 `VALIDATION_ERROR`

### PATCH /reminders/:id

Any of `remindAt`, `weekdays` (`null` clears), `enabled`. **200** `{ "reminder": { … } }`

**Errors:** 404 (not yours), 409 `REMINDER_DUPLICATE`, 422.

### DELETE /reminders/:id

**204**. **Errors:** 404.

---

## 10. Notifications

Notifications are in-app messages that belong to you, whatever workspace they come from.

| Type | Created when | `data` |
|---|---|---|
| `habit_reminder` | A reminder is due | `{ habitId, reminderId, date }` |
| `streak_milestone` | Your streak reaches 7, 30, 100 or 365 | `{ habitId, streak, unit }` |
| `system` | Product messages | Varies |

Missing a day never creates a notification. Notifications older than 90 days are deleted automatically.

### GET /notifications?unreadOnly&page&limit

Newest first. `unreadOnly` is `true` or `false` (default `false`).

```json
{
  "data": [
    { "id": "4f0c…", "type": "streak_milestone", "title": "7-day streak!",
      "message": "You've completed \"Water\" 7 days in a row. That's real consistency. Keep it going!",
      "data": { "habitId": "189c5b89-…", "streak": 7, "unit": "days" }, "readAt": null,
      "createdAt": "2026-10-28T13:00:02.000Z" },
    { "id": "a71d…", "type": "habit_reminder", "title": "Gym",
      "message": "It's time for \"Gym\".",
      "data": { "habitId": "e70a853f-…", "reminderId": "9c1e…", "date": "2026-10-28" }, "readAt": null,
      "createdAt": "2026-10-28T13:00:00.000Z" }
  ],
  "meta": { "page": 1, "limit": 20, "total": 2, "unreadCount": 2 }
}
```

### GET /notifications/unread-count

**200** `{ "unreadCount": 2 }`, for the bell badge.

### PATCH /notifications/:id/read

**200** `{ "notification": { … "readAt": "2026-10-28T13:05:00.000Z" } }`. Idempotent: the first `readAt` is kept.

**Errors:** 404 (not yours), 422 (malformed id).

### POST /notifications/read-all

**200** `{ "updated": 2 }`
