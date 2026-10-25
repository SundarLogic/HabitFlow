# HabitFlow — Entity Relationship Diagram

The database schema as built by the migrations in [backend/src/migrations](../backend/src/migrations). Business rules behind the schema are in [CLAUDE.md](../CLAUDE.md) §3.1. Decisions are in [DECISIONS.md](DECISIONS.md) (ADR-024 to ADR-028).

All primary keys are UUIDs (`gen_random_uuid()`, pgcrypto). Timestamps are `TIMESTAMPTZ` stored in UTC. `DATE` columns are calendar days in the user's timezone. Enum-like columns are `VARCHAR` with a named `CHECK` constraint.

```mermaid
erDiagram
    users ||--o{ sessions : "logs in with"
    users ||--o{ workspaces : "owns"
    users ||--o{ workspace_members : "is member via"
    workspaces ||--o{ workspace_members : "has"
    workspaces ||--o| workspace_subscriptions : "subscribes via"
    plans ||--o{ workspace_subscriptions : "is used by"
    workspaces ||--o{ habits : "contains"
    users ||--o{ habits : "created"
    habits ||--o{ habit_schedule_days : "scheduled on"
    habits ||--o{ habit_completions : "has"
    users ||--o{ habit_completions : "completed"
    habits ||--o{ habit_reminders : "has"
    users ||--o{ habit_reminders : "receives"
    users ||--o{ notifications : "receives"

    users {
        uuid id PK
        varchar name "1-100"
        varchar email UK "lowercase"
        varchar password_hash "bcrypt"
        varchar timezone "IANA, default UTC"
        jsonb notification_preferences "default inApp+reminders true"
        timestamptz last_login_at "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    sessions {
        uuid id PK
        uuid user_id FK "CASCADE"
        char token_hash UK "sha256 hex"
        varchar user_agent "nullable"
        inet ip "nullable"
        timestamptz expires_at
        timestamptz last_used_at
        timestamptz created_at
    }
    plans {
        uuid id PK
        varchar code UK "free, pro"
        varchar name
        jsonb limits "maxActiveHabits, historyDays"
        jsonb features "purchasable"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    workspaces {
        uuid id PK
        varchar name "1-100"
        uuid owner_user_id FK "RESTRICT"
        varchar workspace_type "personal | team"
        timestamptz created_at
        timestamptz updated_at
    }
    workspace_members {
        uuid id PK
        uuid workspace_id FK "CASCADE"
        uuid user_id FK "CASCADE"
        varchar role "owner | admin | member"
        timestamptz joined_at
        timestamptz updated_at
    }
    workspace_subscriptions {
        uuid id PK
        uuid workspace_id FK,UK "CASCADE"
        uuid plan_id FK "RESTRICT"
        varchar status "active | trialing | past_due | canceled"
        timestamptz current_period_end "nullable"
        varchar provider "nullable"
        varchar provider_customer_id "nullable"
        varchar provider_subscription_id "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    habits {
        uuid id PK
        uuid workspace_id FK "CASCADE"
        uuid created_by FK "RESTRICT"
        varchar name "1-100"
        varchar description "nullable, max 500"
        varchar category "nullable, max 50"
        varchar color "nullable, #RRGGBB"
        varchar icon "nullable, max 50"
        varchar frequency_type "daily | weekdays | weekly_target"
        smallint target_per_week "1-7 iff weekly_target"
        date start_date
        varchar status "active | archived"
        timestamptz archived_at "set iff archived"
        int sort_order "default 0"
        timestamptz created_at
        timestamptz updated_at
    }
    habit_schedule_days {
        uuid id PK
        uuid habit_id FK "CASCADE"
        smallint weekday "ISO 1=Mon..7=Sun"
        timestamptz created_at
    }
    habit_completions {
        uuid id PK
        uuid habit_id FK "CASCADE"
        uuid completed_by FK "RESTRICT"
        date completion_date
        timestamptz completed_at
        varchar note "nullable, max 280"
        timestamptz created_at
        timestamptz updated_at
    }
    habit_reminders {
        uuid id PK
        uuid habit_id FK "CASCADE"
        uuid user_id FK "CASCADE"
        time remind_at "local time in user tz"
        smallint_array weekdays "nullable = every scheduled day"
        boolean enabled
        timestamptz created_at
        timestamptz updated_at
    }
    notifications {
        uuid id PK
        uuid user_id FK "CASCADE"
        varchar type "habit_reminder | streak_milestone | system"
        varchar title "1-120"
        varchar message "1-500"
        jsonb data
        varchar dedupe_key UK "nullable"
        timestamptz read_at "nullable"
        timestamptz created_at
    }
```

## Constraints and indexes

| Table | Unique | Checks | Other indexes |
|---|---|---|---|
| users | `email` | email is lowercase; name 1–100; timezone non-empty; preferences is an object | — |
| sessions | `token_hash` | token_hash is 64 lowercase hex chars | `user_id`, `expires_at` |
| plans | `code` | code is `lower_snake_case`; limits/features are objects | — |
| workspaces | one `personal` per owner (partial unique index) | type ∈ personal, team; name 1–100 | `owner_user_id` |
| workspace_members | `(workspace_id, user_id)` | role ∈ owner, admin, member | `user_id` |
| workspace_subscriptions | `workspace_id` | status ∈ active, trialing, past_due, canceled | `plan_id` |
| habits | — | frequency_type valid; `target_per_week` 1–7 when weekly_target, NULL otherwise; status valid; `archived_at` set exactly when archived; text lengths; color `#RRGGBB` | `(workspace_id, status)`, `created_by` |
| habit_schedule_days | `(habit_id, weekday)` | weekday 1–7 | — |
| habit_completions | `(habit_id, completed_by, completion_date)` | note ≤ 280 | `(habit_id, completion_date)`, `(completed_by, completion_date)` |
| habit_reminders | `(habit_id, user_id, remind_at)` | weekdays NULL or non-empty subset of 1–7 | `enabled`, `user_id` |
| notifications | `dedupe_key` (NULLs allowed) | type valid; title 1–120; message 1–500; data is an object | `(user_id, read_at, created_at DESC)`, `created_at` |

## Delete behaviour

- **CASCADE**: deleting a workspace removes its members, subscription and habits. Deleting a habit removes its schedule days, completions and reminders. Deleting a user removes their sessions, memberships, reminders and notifications.
- **RESTRICT**: a user who still owns a workspace (`workspaces.owner_user_id`), created habits (`habits.created_by`) or completions (`habit_completions.completed_by`) can't be deleted directly. Account deletion (not in first release) must delete the personal workspace first, which cascades away that user's habits and history. A plan with subscriptions can't be deleted.
