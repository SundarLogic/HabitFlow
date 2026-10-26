/**
 * Performance dataset (Phase 11): `npm run perf:seed` (development database only).
 *
 * Creates PERF_USERS users (default 20), each with a personal workspace on the Pro plan and
 * 50 active habits started 2 years ago (a third daily, a third Mon/Wed/Fri, a third 3x per week),
 * with ~70% of their days completed. The first user, perf-0@habitflow.local / habitflow-perf,
 * is the one the benchmark logs in as; the others are realistic "noise" so the indexes must
 * select one user's rows out of hundreds of thousands.
 *
 * Re-running replaces the previous perf data (everything owned by perf-*@habitflow.local).
 * Rows are generated in SQL with generate_series, so this takes seconds, not minutes.
 */
import { env } from '../../src/config/env.js';
import { sequelize } from '../../src/models/index.js';
import { hashPassword } from '../../src/utils/password.js';

if (env.NODE_ENV !== 'development') {
  throw new Error(
    `perf:seed only runs against the development database (NODE_ENV=${env.NODE_ENV})`,
  );
}

const USERS = Number(process.env.PERF_USERS ?? 20);
const HABITS_PER_USER = 50;
const DAYS = 730;
const PERF_EMAILS = "u.email LIKE 'perf-%@habitflow.local'";

const passwordHash = await hashPassword('habitflow-perf');
const started = Date.now();

await sequelize.transaction(async (transaction) => {
  const run = (sql, replacements = {}) => sequelize.query(sql, { replacements, transaction });

  // Old perf data: deleting the workspaces cascades to habits, completions, members...
  await run(
    `DELETE FROM workspaces w USING users u WHERE w.owner_user_id = u.id AND ${PERF_EMAILS}`,
  );
  await run(`DELETE FROM users u WHERE ${PERF_EMAILS}`);

  await run(
    `INSERT INTO users (name, email, password_hash, timezone, notification_preferences)
     SELECT 'Perf ' || g, 'perf-' || g || '@habitflow.local', :passwordHash, 'America/New_York',
            '{"inApp": true, "reminders": true}'::jsonb
       FROM generate_series(0, :lastUser) g`,
    { passwordHash, lastUser: USERS - 1 },
  );
  await run(
    `INSERT INTO workspaces (name, owner_user_id, workspace_type)
     SELECT u.name || '''s Habits', u.id, 'personal' FROM users u WHERE ${PERF_EMAILS}`,
  );
  await run(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     SELECT w.id, w.owner_user_id, 'owner'
       FROM workspaces w JOIN users u ON u.id = w.owner_user_id WHERE ${PERF_EMAILS}`,
  );
  // Pro (unlimited habits): 50 active habits would exceed the free plan's 10.
  await run(
    `INSERT INTO workspace_subscriptions (workspace_id, plan_id, status)
     SELECT w.id, (SELECT id FROM plans WHERE code = 'pro'), 'active'
       FROM workspaces w JOIN users u ON u.id = w.owner_user_id WHERE ${PERF_EMAILS}`,
  );
  await run(
    `INSERT INTO habits (workspace_id, created_by, name, category, color, frequency_type,
                         target_per_week, start_date, sort_order)
     SELECT w.id, w.owner_user_id, 'Habit ' || n,
            (ARRAY['Health', 'Fitness', 'Learning', 'Mind', 'Home'])[1 + n % 5], '#4F46E5',
            (ARRAY['daily', 'weekdays', 'weekly_target'])[1 + n % 3],
            CASE WHEN n % 3 = 2 THEN 3 END, current_date - :days, n
       FROM workspaces w JOIN users u ON u.id = w.owner_user_id
      CROSS JOIN generate_series(0, :lastHabit) n
      WHERE ${PERF_EMAILS}`,
    { days: DAYS, lastHabit: HABITS_PER_USER - 1 },
  );
  await run(
    `INSERT INTO habit_schedule_days (habit_id, weekday)
     SELECT h.id, d FROM habits h JOIN users u ON u.id = h.created_by
      CROSS JOIN (VALUES (1), (3), (5)) AS days(d)
      WHERE h.frequency_type = 'weekdays' AND ${PERF_EMAILS}`,
  );
  await run(
    `INSERT INTO habit_completions (habit_id, completed_by, completion_date, completed_at)
     SELECT h.id, h.created_by, d::date, d + interval '13 hours'
       FROM habits h JOIN users u ON u.id = h.created_by
      CROSS JOIN LATERAL generate_series(h.start_date, current_date, interval '1 day') d
      WHERE ${PERF_EMAILS}
        AND random() < CASE WHEN h.frequency_type = 'weekly_target' THEN 0.45 ELSE 0.7 END
        AND (h.frequency_type <> 'weekdays' OR extract(isodow FROM d) IN (1, 3, 5))`,
  );
});

// Fresh planner statistics, as autovacuum would eventually produce.
await sequelize.query('ANALYZE');
const [[counts]] = await sequelize.query(
  `SELECT (SELECT count(*) FROM habits) AS habits, (SELECT count(*) FROM habit_completions) AS completions`,
);
process.stdout.write(
  `perf data: ${USERS} users x ${HABITS_PER_USER} habits x ${DAYS} days -> ` +
    `${counts.habits} habits, ${counts.completions} completions in the database ` +
    `(${((Date.now() - started) / 1000).toFixed(1)} s). Log in as perf-0@habitflow.local / habitflow-perf\n`,
);
await sequelize.close();
