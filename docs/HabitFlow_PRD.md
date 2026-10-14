HabitFlow — Product Requirements Document
Version: 1.0 · Status: Finalized product direction · Date: October 2026

A cross-platform habit-tracking SaaS product for building consistent routines, measuring progress, and understanding personal habits.

Product vision: Make habit tracking simple enough to use every day and useful enough to understand progress over months — not just days.

Final product decisions (summary)
Decision Direction
Platform Responsive React web app first; React Native mobile client planned against the same API.
Habit scheduling Daily habits, selected weekdays, and weekly completion targets.
Reminders In-app reminder preferences, due indicators, and notifications in the first release.
Business model SaaS-ready architecture with free and future paid tiers; billing deferred.
Technology React, Node.js, Express.js, PostgreSQL, Sequelize, REST/JSON.
This document includes sections 1–10 of the finalized PRD and implementation blueprint. The roadmap and first implementation task are intentionally omitted.

1. Product overview
   Product name: HabitFlow
   Product type: Cross-platform habit tracking and personal productivity SaaS.
   HabitFlow enables users to create recurring habits, record completions, monitor streaks, review historical progress, and receive useful in-app reminders. The product prioritizes speed and clarity: recording a completed habit should take only a few seconds.

Problem statement
People forget to perform habits consistently.
Progress is difficult to measure over time using notebooks or disconnected apps.
A missed day can reduce motivation.
Users need a clear view of current routines and longer-term consistency.
Proposed solution
A centralized habit tracker combining daily tracking, flexible schedules, streaks, reminders, and progress analytics in a responsive experience.

2. Final product decisions
   Area Decision Implementation implication
   Platform Web + mobile Build responsive React web first; add React Native later using the same backend API.
   Scheduling Daily, weekdays, weekly targets Model schedule rules explicitly and test streak calculations.
   Reminders In-app first Persist preferences and notification records; defer push delivery.
   Scope SaaS Design user/workspace isolation and feature entitlements early.
   Product principles
   Daily tracking should be fast and intuitive.
   Core tracking should remain useful on the free tier.
   Missing a day should not create punitive or discouraging feedback.
   Mobile usage should be comfortable and responsive.
   Avoid unnecessary complexity until real user demand is validated.
3. Scope and release strategy
   Feature First release Later release
   Registration, login, account settings Yes Enhancements
   Habit CRUD and flexible schedules Yes Advanced schedules
   Completion history and streaks Yes Additional insights
   Dashboard and basic analytics Yes Advanced reports and exports
   In-app reminders Yes Push notifications
   Responsive web app Yes PWA improvements
   Mobile app API-ready architecture React Native client
   Free/paid plan definitions Basic entitlements Billing automation
   Team workspaces Data model prepared Collaboration features
   Wearables, AI coaching, social challenges No Reassess after validation
   Scope guardrail: SaaS architecture is included from the beginning, but payments, team collaboration, and a full mobile client should not block the first usable release.

4. Core features and requirements
   4.1 User authentication
   Registration with name, email, and password; reject duplicate emails.
   Login, logout, and current-user endpoint.
   Secure password hashing and revocable authentication.
   Users may access only resources authorized for their account and workspace.
   4.2 Habit management
   Create habits with name, optional description, category, and start date.
   Support daily, selected-weekday, and weekly-target schedules.
   Allow users to edit, archive, or delete habits under a defined retention policy.
   Separate active habits from archived habits.
   4.3 Daily habit tracking
   List habits scheduled for the selected date.
   Mark a habit complete and undo completion.
   Show completed, pending, and historical states clearly.
   Prevent duplicate completion records for a habit and date.
   4.4 Streak tracking
   Display current and longest streaks.
   Calculate streaks based on scheduled days, not every calendar day by default.
   Recalculate derived metrics after historical edits.
   Handle weekly-target habits according to explicit weekly rules.
   4.5 Dashboard and analytics
   Show today's completion percentage and remaining scheduled habits.
   Provide weekly/monthly summaries and a calendar or heatmap.
   Filter analytics by habit and date range.
   Provide helpful empty, loading, and error states.
   4.6 Reminders and in-app notifications
   Allow users to set reminder preferences and times.
   Store timezone-aware settings.
   Show due indicators and in-app notifications.
   Design the notification model so push or email delivery can be added later.
5. User stories and acceptance criteria
   User story Acceptance criteria
   Register Valid registration creates an account; duplicate email is rejected.
   Create a habit Required fields are validated and the habit appears on scheduled dates.
   Complete a habit Completion state updates and duplicate records are prevented.
   Undo completion Completion is removed or updated and dependent metrics are recalculated.
   View a streak Streak reflects schedule and valid completion history.
   Review history Selected date range shows correct historical data.
   Archive a habit Habit leaves active tracking while history remains available.
   Protect privacy Requests for another user's resources are rejected by the backend.
6. Main user journey
   Register or log in — Create an account or authenticate.
   Create habits — Choose name, category, frequency, and optional reminder.
   Track today's habits — Mark completion or undo it.
   Review progress — View streaks, completion rate, and historical activity.
   Dashboard requirements
   Date selector with previous/next day navigation.
   Add Habit action and quick access to history.
   Daily progress summary and per-habit completion state.
   Weekly progress visualization.
   Accessible status indicators and keyboard navigation.
   Empty state for new users with a prompt to create the first habit.
7. Business rules
   One completion per scheduled date: enforce a database uniqueness rule appropriate to the habit's completion model.
   Scheduled days matter: unscheduled days do not break a weekday-based streak.
   Pending versus missed: today's incomplete habit remains pending until its day or relevant period ends.
   Timezone handling: store timestamps consistently and calculate calendar dates in the user's configured timezone.
   Historical edits: changes to past completions update streak and analytics calculations.
   Archiving: stops active tracking while preserving historical records.
   Deletion: follow an explicit retention policy and avoid orphaned completion records.
   Weekly targets: evaluate progress against a defined week; do not treat an in-progress week as failed prematurely.
   Completion rate: completed scheduled instances divided by total scheduled instances for the selected period; show an empty state when the denominator is zero.
8. Data model
   Core tables
   Table Representative fields / purpose
   users id (PK), name, email (unique), password_hash, timezone, created_at, updated_at
   workspaces id (PK), name, owner_user_id, workspace_type, created_at
   workspace_members id (PK), workspace_id (FK), user_id (FK), role, joined_at
   habits id (PK), workspace_id (FK), created_by, name, description, category, frequency_type, target_per_week, start_date, status
   habit_schedule_days id (PK), habit_id (FK), weekday
   habit_completions id (PK), habit_id (FK), completed_by, completion_date, completed_at
   notifications id (PK), user_id (FK), type, title, message, read_at, created_at
   plans Plan definitions, feature limits, and entitlements.
   workspace_subscriptions Workspace plan, subscription status, and future billing-provider references.
   Relationships
   One user can belong to multiple workspaces.
   A workspace has members and contains habits.
   A habit has schedule rules and completion records.
   A user receives notifications.
   A workspace can use a free plan or have a subscription.
   Database constraints and indexes
   Unique email address and unique workspace membership per user.
   Foreign keys and valid values for frequency types and weekdays.
   Enforce habit completion uniqueness according to the chosen personal/shared completion model.
   Index common access paths such as workspace_id, habit_id, and completion_date.
   Use migrations for schema changes; do not depend on automatic production schema alteration.
   Use UUID primary keys if beneficial for distributed identifiers; derive streaks from completion history initially.
   Personal versus shared habits: each user receives a personal workspace by default. Shared habits and team permissions are deferred, but workspace ownership and membership are established in the schema.

9. API requirements
   Version REST endpoints under /api/v1. Use JSON responses, consistent errors, validation, authentication, and workspace authorization.

Method Endpoint Purpose
POST /api/v1/auth/signup Register a user
POST /api/v1/auth/login Log in
POST /api/v1/auth/logout Log out
GET /api/v1/auth/me Get current user
GET /api/v1/workspaces List accessible workspaces
GET /api/v1/habits List habits in active workspace
POST /api/v1/habits Create a habit
GET /api/v1/habits/:id Get habit details
PATCH /api/v1/habits/:id Update a habit
DELETE /api/v1/habits/:id Archive/delete per policy
PUT /api/v1/habits/:id/completions/:date Mark a date complete
DELETE /api/v1/habits/:id/completions/:date Undo completion
GET /api/v1/completions Query history by date range
GET /api/v1/analytics/summary Dashboard summary
GET /api/v1/notifications List in-app notifications
PATCH /api/v1/notifications/:id/read Mark notification as read
API design rules
Validate request bodies, route parameters, and query strings.
Use appropriate HTTP status codes and consistent JSON error shapes.
Check workspace membership and resource ownership on every protected request.
Bound history and analytics queries with date ranges and pagination where appropriate.
Use transactions for multi-record operations and automated tests for authorization and date boundaries.
Workspace invitations, team management, subscription, and billing endpoints are deferred to their implementation phases.

10. Recommended technology stack
    Layer Technology Responsibility
    Web frontend React Dashboard, forms, habit lists, analytics
    Mobile client React Native (later) Mobile experience using the shared API
    Styling CSS or Tailwind CSS Responsive interface
    Backend Node.js + Express.js Routes, validation, authorization, business logic
    Database PostgreSQL Users, workspaces, habits, completion history
    ORM/migrations Sequelize + Sequelize CLI Models, relations, controlled schema changes
    API REST + JSON Shared contract for web and mobile
    Validation Schema-validation middleware Input validation and consistent errors
    Authentication Secure, revocable sessions Prefer HttpOnly secure cookies for browser sessions where practical
    Testing Jest or Vitest + Supertest Unit and API tests
    Source control Git + GitHub Version control and collaboration
    Deployment Frontend and Node-compatible hosting Deploy clients and API with secrets kept server-side
    Suggested project structure
    habitflow/
    ├── backend/
    │ ├── src/
    │ │ ├── config/
    │ │ ├── models/
    │ │ ├── migrations/
    │ │ ├── routes/
    │ │ ├── controllers/
    │ │ ├── services/
    │ │ ├── middleware/
    │ │ ├── validators/
    │ │ ├── app.js
    │ │ └── server.js
    │ ├── tests/
    │ ├── .env.example
    │ └── package.json
    └── frontend/
    ├── src/
    │ ├── components/
    │ ├── pages/
    │ ├── services/
    │ ├── hooks/
    │ └── App.jsx
    └── package.json
    Security and reliability requirements
    Hash passwords with bcrypt or Argon2.
    Use secure, HttpOnly cookies for browser authentication where practical, with suitable CSRF protection.
    Configure CORS for known client origins and apply authentication rate limits.
    Keep secrets in environment variables and out of source control.
    Enforce workspace membership and role permissions in the backend.
    Do not log passwords, session tokens, or other sensitive values.
    Test database constraints, transaction behavior, and duplicate requests.
    Monitor errors and slow queries after deployment.
