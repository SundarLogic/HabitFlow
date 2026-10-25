# Streak and status rules

How HabitFlow decides whether a day counts, what a streak is, and what the dashboard shows. These rules are binding (CLAUDE.md §3.1). The code is `backend/src/domain/streaks.js`, and every example below is a unit test in `backend/tests/unit/streaks.test.js`.

**Guiding principle:** missing a day must never produce punitive feedback. Anything still in progress (today, or the current week) is **pending**, never a failure.

## Calendar used in the examples

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Oct 19 | 20 | 21 | 22 | 23 | 24 | 25 |
| Oct 26 | 27 | 28 | 29 | 30 | 31 | Nov 1 |

## 1. Basics

- **Today** is the user's calendar date in their own IANA timezone, never the server's and never UTC. At 02:30 UTC on Oct 26 it is still Sunday Oct 25 in New York but already Monday Oct 26 in Auckland. Each user is evaluated against their own date.
- **Weeks** are ISO weeks, Monday to Sunday.
- **Streaks are never stored.** They are recomputed from the completion history on every read. Adding or removing a past completion therefore changes the streak immediately; there is no stale value to repair.
- **Which completions count:** only those on a day that is scheduled under the habit's **current** schedule, on or after `startDate`, and not after today. Other completions stay in the database but are ignored. For example, a Tuesday completion stops counting if the habit is changed to Mon/Wed/Fri.

## 2. Scheduled days

| Frequency | Scheduled days |
|---|---|
| `daily` | Every day from `startDate` |
| `weekdays` | Only the chosen ISO weekdays (1 = Mon … 7 = Sun) from `startDate` |
| `weekly_target` | Every day from `startDate`; any day counts toward the week |

Nothing is scheduled before `startDate`.

## 3. Day status

Each habit has one status per date, as seen from today:

| Status | `daily` / `weekdays` | `weekly_target` (the week is the unit) |
|---|---|---|
| `completed` | A completion exists that day | A completion exists that day, **or** that week already met its target |
| `pending` | It is today and not done yet | Not done that day, and the week isn't over yet |
| `missed` | A past scheduled day without a completion | Not done that day, and the week ended below target |
| `not_scheduled` | Before `startDate`, or a weekday the habit doesn't run on | Before `startDate` |
| `upcoming` | After today | After today |

**Example (Mon/Wed/Fri habit, today = Fri Oct 23, done only on Mon Oct 19):** Mon 19 is `completed`, Wed 21 is `missed`, Thu 22 is `not_scheduled`, Fri 23 is `pending`, Mon 26 is `upcoming`.

**Example (weekly target 2, done Mon 19, Tue 20 and Mon 26; today = Wed 28):** Fri 23 is `completed`, because the week of the 19th already reached 2/2. Tue 27 is `pending`, because the week of the 26th has 1/2 and isn't over.

## 4. Streaks for `daily` and `weekdays` habits (unit: days)

**Current streak:** walk backwards over **scheduled days only**, counting completed days, and stop at the first scheduled day that wasn't completed.

- If today is scheduled and done, today is counted.
- If today is scheduled but **not done yet**, it is pending. Counting starts from the previous scheduled day, so an unfinished today never breaks a streak.
- Unscheduled days (weekends for a Mon–Fri habit, for example) are skipped and never break a streak.

**Longest streak:** the longest run of consecutive completed scheduled days in the whole history, using the same skipping rules.

| Situation | Completions | Today | Current | Longest |
|---|---|---|---|---|
| Done today | 23, 24, 25 | Sun 25 | 3 | 3 |
| Today still open | 23, 24 | Sun 25 | **2** (today is pending) | 2 |
| Gap yesterday, done today | 22, 23, 25 | Sun 25 | 1 | 2 |
| Gap yesterday, today open | 22, 23 | Sun 25 | 0 | 2 |
| Mon–Fri habit across a weekend | Mon 19 – Fri 23, Mon 26 | Mon 26 | **6** (weekend skipped) | 6 |
| Mon–Fri habit, viewed on Saturday | Mon 19 – Fri 23 | Sat 24 | 5 (today `not_scheduled`) | 5 |
| Mon/Wed/Fri across a week | Wed 21, Fri 23, Mon 26 | Mon 26 | 3 | 3 |
| Back-filling a past gap | Oct 10–14 and 16–20, then add the 15th | Tue 20 | 5 → **11** | 5 → 11 |

## 5. Streaks for `weekly_target` habits (unit: weeks)

A week is **met** when its completions reach the week's target.

- **Current streak** = consecutive met weeks counting back from last week, **plus 1 if this week has already met its target**. An unmet current week is pending: it isn't counted, and it doesn't break the streak.
- **Longest streak** = the longest run of consecutive met weeks.
- Extra completions beyond the target are fine; they don't carry over to other weeks.
- `weekProgress: { done, target }` shows the current week, for example "2 of 3".

| Situation (target 3, started Mon Oct 5) | Current | Notes |
|---|---|---|
| Weeks of Oct 5, 12 and 19 met; this week (Oct 26) has 1 so far; today Wed 28 | **3** | This week is pending, so it doesn't count yet and doesn't break anything |
| Same, and this week reaches 3 | 4 | Counts as soon as the target is met, without waiting for Sunday |
| Weeks of Oct 5 and 19 met, week of Oct 12 had only 2 | 1 | The unmet week ended the earlier run |

### Prorated first week (ADR-038)

If `startDate` is not a Monday, the first week is shorter, so its target is reduced to what is possible:

> **first-week target = min(targetPerWeek, number of days from startDate to that Sunday)**

| Started on | Days left in that week | Target 5 becomes | Target 2 becomes |
|---|---|---|---|
| Monday | 7 | 5 (no change) | 2 |
| Wednesday | 5 | 5 | 2 |
| Friday | 3 | **3** | 2 |
| Sunday | 1 | **1** | **1** |

Every later week uses the full target. Completions before `startDate` don't count, even in the same week.

## 6. The daily overview (`GET /today`)

- Lists every **active** habit scheduled on the chosen date (default: today in the user's timezone), with `completed`, `completion`, `status`, `streak` and, for weekly habits, `weekProgress` for that date's week.
- Streaks are always "as of today", even when viewing another date.
- **Summary:** `scheduled` = habits listed; `completed` = status `completed`; `remaining` = status `pending`; `percent = round(completed / scheduled × 100)`. When nothing is scheduled, `percent` is `null` (the UI shows an empty state), never 0% or an error.

## 7. Which dates can be completed (`PUT /habits/:id/completions/:date`)

| Rule | Error |
|---|---|
| Habit not in your workspace | 404 `NOT_FOUND` |
| Habit archived (its history is read-only) | 409 `HABIT_ARCHIVED` |
| Date after today (user timezone) | 422 `DATE_NOT_COMPLETABLE`, `details.reason = DATE_IN_FUTURE` |
| Date before `startDate` | 422 `DATE_NOT_COMPLETABLE`, `details.reason = BEFORE_START_DATE` |
| `weekdays` habit on a day it doesn't run | 422 `DATE_NOT_SCHEDULED` |

Marking an already-completed date returns **200** with the existing record (a new completion returns 201); two clicks or a retried request can never create duplicates. Undoing a completion returns 204 whether or not it existed.

## 8. Edge cases covered by tests

- **DST:** New York's 23-hour day (Mar 8 2026) and 25-hour day (Nov 1 2026). Streaks run straight through both, and "today" switches exactly at local midnight. Dates are handled as calendar dates, never as hours, so DST can't shift them.
- **Different timezones at the same instant:** an Auckland user can already have missed yesterday while a Los Angeles user, at the same instant, still has today pending.
- **Leap years:** Feb 28 → Feb 29 → Mar 1 is a 3-day streak in 2028; Feb 28 → Mar 1 is consecutive in 2027.
- **A habit starting today, or in the future:** no streak, and status `pending` or `not_scheduled` respectively.
- **Cross-check:** a deliberately naive second implementation is compared with the real one on 600 random histories (`streaks.reference.test.js`).
