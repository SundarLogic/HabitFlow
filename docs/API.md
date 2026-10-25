# HabitFlow API reference

REST/JSON API used by the web app (and later the mobile app). All paths are prefixed with `/api/v1`. Conventions such as error shape, pagination and status codes are defined in [CLAUDE.md §5](../CLAUDE.md); the rules behind streaks and rates are in [STREAK_RULES.md](STREAK_RULES.md).

The example responses below are real output from the test fixture in `backend/tests/integration/analytics.test.js`, a New York user on **Wednesday 2026-10-28** with four habits:

| Habit | Schedule | Notes |
|---|---|---|
| Water | daily | Health |
| Gym | Mon/Wed/Fri | Fitness |
| Run | weekly target 2 | Fitness |
| Old | daily | Health; archived on Oct 21 |

## Calling the API

- **Browser:** send `credentials: 'include'`, and on every non-GET request an `X-CSRF-Token` header holding the `csrf_token` cookie value.
- **Mobile / scripts:** `Authorization: Bearer <session token>` (no CSRF header needed).
- **Workspace:** optional `X-Workspace-Id: <uuid>`; defaults to your personal workspace.
- **Dates** are calendar dates `YYYY-MM-DD` in **your** timezone; timestamps are ISO-8601 UTC.
- **Rates** (`completionRate`, `rate`) are fractions from 0 to 1 with up to 4 decimals. `percent` is an integer from 0 to 100. A rate or percent is **`null` when nothing was due**: show an empty state, not 0%.

### Errors

```json
{ "error": { "code": "DATE_NOT_COMPLETABLE", "message": "Cannot complete a habit for a future date",
             "details": { "reason": "DATE_IN_FUTURE", "today": "2026-10-28" } } }
```

## Endpoint index

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness and DB status |
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | Account and session |
| GET | `/auth/me`, `/auth/csrf` | Current user, workspaces and plan; CSRF bootstrap |
| PATCH / DELETE | `/users/me` | Update profile / delete account |
| PATCH | `/users/me/password` | Change password (logs out other devices) |
| GET | `/workspaces` | Workspaces you belong to |
| GET / POST | `/habits` | List (filter, search, paginate) / create |
| GET | `/habits/categories` | Distinct categories |
| PATCH | `/habits/reorder` | Bulk sort order |
| GET / PATCH / DELETE | `/habits/:id` | Detail with streaks / update / archive or permanent delete |
| POST | `/habits/:id/archive`, `/habits/:id/unarchive` | Archive / restore |
| GET | `/habits/:id/history?from&to` | Per-day status for the habit calendar |
| PUT / DELETE | `/habits/:id/completions/:date` | Mark done (201 new / 200 existing) / undo (204) |
| GET | `/completions?from&to&habitId&page&limit` | Completion history |
| GET | `/today?date` | Dashboard: today's habits and summary |
| GET | `/analytics/summary?from&to&habitId&includeArchived` | Rates, series, streaks, categories |
| GET | `/analytics/heatmap?year` or `?from&to` | Calendar heatmap |

## Analytics

### How the numbers are counted

- A **scheduled instance** is one thing that was due: a scheduled **day** for daily and weekdays habits, or one ISO **week** for a weekly target, complete when that week's completions reach the target.
- **Completion rate** = completed instances ÷ scheduled instances, or `null` if nothing was due.
- **Nothing in progress lowers a rate.** Today counts only once it's done, and the current week only once its target is met.
- **Archived habits** are part of history and are evaluated only up to their archive date: days after archiving are never "missed". They are left out of `today`. Hide them with `includeArchived=false`.
- **`daily` and the heatmap** count day-based habits only. A weekly target has no per-day instance, so it appears in `weekly`, `overall`, `byHabit` and `byCategory`.
- **A week overlapping the range start** is included and evaluated on all of its own completions.
- **Streaks** are always as of today, whatever range is requested.

### GET /analytics/summary

Range: `from` and `to` together (at most 366 days); default is the last 30 days including today. Optional `habitId` (another workspace's habit → 404) and `includeArchived=true|false` (default `true`).

`GET /api/v1/analytics/summary?from=2026-10-26&to=2026-10-28`

```json
{
  "range": { "from": "2026-10-26", "to": "2026-10-28" },
  "today": { "scheduled": 3, "completed": 1, "remaining": 2, "percent": 33 },
  "overall": { "completionRate": 0.75, "completed": 3, "scheduled": 4 },
  "bestStreak": { "habitId": "189c5b89-82a1-4d07-8580-9fa031fc1305", "name": "Water", "longest": 5, "unit": "days" },
  "daily": [
    { "date": "2026-10-26", "scheduled": 2, "completed": 2, "rate": 1 },
    { "date": "2026-10-27", "scheduled": 1, "completed": 0, "rate": 0 },
    { "date": "2026-10-28", "scheduled": 1, "completed": 1, "rate": 1 }
  ],
  "weekly": [
    { "weekStart": "2026-10-26", "scheduled": 4, "completed": 3, "rate": 0.75 }
  ],
  "byHabit": [
    { "habitId": "189c5b89-82a1-4d07-8580-9fa031fc1305", "name": "Water", "category": "Health", "status": "active",
      "completionRate": 0.6667, "completed": 2, "scheduled": 3, "currentStreak": 1, "longestStreak": 5, "unit": "days" },
    { "habitId": "e70a853f-9ceb-4284-a4ba-959df006fc7b", "name": "Gym", "category": "Fitness", "status": "active",
      "completionRate": 1, "completed": 1, "scheduled": 1, "currentStreak": 2, "longestStreak": 2, "unit": "days" },
    { "habitId": "715d6dd1-d210-47c5-9bdf-1c996fbfa999", "name": "Run", "category": "Fitness", "status": "active",
      "completionRate": null, "completed": 0, "scheduled": 0, "currentStreak": 1, "longestStreak": 1, "unit": "weeks" },
    { "habitId": "56077157-6bfe-4b70-93a7-a55eaf0e546e", "name": "Old", "category": "Health", "status": "archived",
      "completionRate": null, "completed": 0, "scheduled": 0, "currentStreak": 0, "longestStreak": 1, "unit": "days" }
  ],
  "byCategory": [
    { "category": "Health", "completionRate": 0.6667, "completed": 2, "scheduled": 3 },
    { "category": "Fitness", "completionRate": 1, "completed": 1, "scheduled": 1 }
  ]
}
```

Reading this example:

- **Gym** shows 1/1 because Wednesday the 28th is still pending, so only Monday counts.
- **Run** has `completionRate: null` because this week is at 1 of 2 and still running, so nothing was due yet. Its current streak of 1 week comes from last week.
- **Old** has nothing due in this range because it was archived on the 21st.
- `byCategory` uses `"category": null` for habits without a category.

### GET /analytics/heatmap

`?year=YYYY` (2000–2100) or `?from&to` (at most 366 days); default is the current year. Every day of the range is returned, including future days with zeros.

`GET /api/v1/analytics/heatmap?from=2026-10-26&to=2026-10-28`

```json
{
  "range": { "from": "2026-10-26", "to": "2026-10-28" },
  "data": [
    { "date": "2026-10-26", "completed": 2, "scheduled": 2 },
    { "date": "2026-10-27", "completed": 0, "scheduled": 1 },
    { "date": "2026-10-28", "completed": 1, "scheduled": 1 }
  ]
}
```

### GET /habits/:id/history

Per-day status for one habit (default: last 30 days; at most 366). Statuses: `completed`, `missed`, `pending` (today, or a weekly target's running week), `not_scheduled` (before the start, an unscheduled weekday, or after the habit was archived) and `upcoming` (future). `completed` is `true` when a completion exists that day.

`GET /api/v1/habits/e70a853f-9ceb-4284-a4ba-959df006fc7b/history?from=2026-10-26&to=2026-10-29` (Gym, Mon/Wed/Fri)

```json
{
  "habitId": "e70a853f-9ceb-4284-a4ba-959df006fc7b",
  "range": { "from": "2026-10-26", "to": "2026-10-29" },
  "data": [
    { "date": "2026-10-26", "status": "completed", "completed": true },
    { "date": "2026-10-27", "status": "not_scheduled", "completed": false },
    { "date": "2026-10-28", "status": "pending", "completed": false },
    { "date": "2026-10-29", "status": "upcoming", "completed": false }
  ]
}
```

## Daily tracking

### GET /today

All **active** habits scheduled on `date` (default: today in your timezone). Streaks are as of today. Weekly-target habits also carry `weekProgress` for that date's week. Abridged: each `habit` is the full habit object, as shown in `GET /habits/:id` below.

```json
{
  "date": "2026-10-28",
  "today": "2026-10-28",
  "habits": [
    { "habit": { "id": "189c5b89-…", "name": "Water", "frequencyType": "daily", "...": "…" },
      "completed": true,
      "completion": { "id": "f79d43ef-8e77-4655-8773-24bef31be245", "habitId": "189c5b89-…", "completedBy": "3a2fad36-…",
                      "completionDate": "2026-10-28", "completedAt": "2026-10-28T16:00:00.000Z", "note": null },
      "status": "completed",
      "streak": { "current": 1, "longest": 5, "unit": "days" } },
    { "habit": { "id": "e70a853f-…", "name": "Gym", "frequencyType": "weekdays", "weekdays": [1, 3, 5], "...": "…" },
      "completed": false, "completion": null, "status": "pending",
      "streak": { "current": 2, "longest": 2, "unit": "days" } },
    { "habit": { "id": "715d6dd1-…", "name": "Run", "frequencyType": "weekly_target", "targetPerWeek": 2, "...": "…" },
      "completed": false, "completion": null, "status": "pending",
      "streak": { "current": 1, "longest": 1, "unit": "weeks" },
      "weekProgress": { "done": 1, "target": 2 } }
  ],
  "summary": { "scheduled": 3, "completed": 1, "remaining": 2, "percent": 33 }
}
```

### PUT /habits/:id/completions/:date

Body (optional): `{ "note": "…" }` (at most 280 characters). Returns **201** when created, **200** when the date was already completed (if a note is sent, it updates the note). Errors: 404 `NOT_FOUND`, 409 `HABIT_ARCHIVED`, 422 `DATE_NOT_COMPLETABLE` (`details.reason`: `DATE_IN_FUTURE` or `BEFORE_START_DATE`), 422 `DATE_NOT_SCHEDULED`.

`PUT /api/v1/habits/189c5b89-…/completions/2026-10-27` with `{ "note": "Late entry" }` → 201

```json
{
  "completion": {
    "id": "b5625891-3fcc-4273-8312-3ef427dc37a3",
    "habitId": "189c5b89-82a1-4d07-8580-9fa031fc1305",
    "completedBy": "3a2fad36-03aa-4037-98f4-b10124c98626",
    "completionDate": "2026-10-27",
    "completedAt": "2026-10-28T16:00:00.000Z",
    "note": "Late entry"
  }
}
```

`completedAt` is when the completion was recorded; `completionDate` is the day it counts for (here a back-filled Tuesday).

### GET /habits/:id

```json
{
  "habit": {
    "id": "715d6dd1-d210-47c5-9bdf-1c996fbfa999", "workspaceId": "cc15dd7f-8e9c-4aae-85a7-8c40faf95f0a",
    "createdBy": "3a2fad36-03aa-4037-98f4-b10124c98626", "name": "Run", "description": null, "category": "Fitness",
    "color": null, "icon": null, "frequencyType": "weekly_target", "weekdays": null, "targetPerWeek": 2,
    "startDate": "2026-10-05", "status": "active", "archivedAt": null, "sortOrder": 2,
    "createdAt": "2026-10-25T18:35:14.770Z", "updatedAt": "2026-10-25T18:35:14.770Z"
  },
  "streaks": { "current": 1, "longest": 1, "unit": "weeks", "status": "pending", "weekProgress": { "done": 1, "target": 2 } }
}
```
