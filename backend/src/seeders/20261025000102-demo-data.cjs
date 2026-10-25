/**
 * Seeder: demo data for LOCAL DEVELOPMENT ONLY.
 *
 * Creates a demo account you can log in with, its personal workspace, 7 habits (all three
 * frequency types, one archived), ~90 days of realistic completions, two reminders and a
 * welcome notification.
 *
 *   email:    demo@habitflow.local
 *   password: habitflow-demo
 *
 * Environment guard:
 *   production  -> throws, so the command fails loudly and nothing is written
 *   test        -> does nothing (db:reset seeds the test DB; tests build their own data)
 *   development -> runs
 *
 * Idempotent: every row has a fixed id or a natural unique key and is inserted with
 * ON CONFLICT DO NOTHING (bulkInsert's ignoreDuplicates). Running it again on a later day only
 * adds the completions for the new days. Completions are chosen by hashing (habit, date), not
 * Math.random(), so the same day always gets the same result.
 */
'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { DateTime } = require('luxon');

const TIMEZONE = 'America/New_York';
const BCRYPT_COST = 12; // CLAUDE.md §3.1: cost >= 12

// Fixed ids make the seeder idempotent and let `down` find exactly what `up` created.
const USER_ID = 'd3e0a000-0000-4000-8000-000000000001';
const WORKSPACE_ID = 'd3e0a000-0000-4000-8000-000000000002';
const MEMBER_ID = 'd3e0a000-0000-4000-8000-000000000003';
const habitId = (n) => `d3e0a000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

// `rate` = chance of completing a scheduled day (weekly_target: chance per day, see below).
// `startOffset` = how many days ago the habit started. `archivedOffset` archives it N days ago.
const HABITS = [
  {
    n: 1,
    name: 'Drink 2L of water',
    category: 'Health',
    color: '#3B82F6',
    icon: 'droplet',
    frequencyType: 'daily',
    rate: 0.9,
    startOffset: 89,
  },
  {
    n: 2,
    name: 'Read 20 pages',
    category: 'Learning',
    color: '#8B5CF6',
    icon: 'book',
    description: 'Any book, any genre. Audiobooks count.',
    frequencyType: 'daily',
    rate: 0.7,
    startOffset: 60,
  },
  {
    n: 3,
    name: 'Gym session',
    category: 'Fitness',
    color: '#EF4444',
    icon: 'dumbbell',
    frequencyType: 'weekdays',
    weekdays: [1, 3, 5],
    rate: 0.8,
    startOffset: 89,
  },
  {
    n: 4,
    name: 'Meditate 10 minutes',
    category: 'Mindfulness',
    color: '#10B981',
    icon: 'leaf',
    frequencyType: 'weekdays',
    weekdays: [1, 2, 3, 4, 5],
    rate: 0.6,
    startOffset: 75,
  },
  {
    n: 5,
    name: 'Go for a run',
    category: 'Fitness',
    color: '#F59E0B',
    icon: 'running',
    frequencyType: 'weekly_target',
    targetPerWeek: 3,
    startOffset: 84,
  },
  {
    n: 6,
    name: 'Call family',
    category: 'Social',
    color: '#EC4899',
    icon: 'phone',
    frequencyType: 'weekly_target',
    targetPerWeek: 1,
    startOffset: 89,
  },
  {
    n: 7,
    name: 'No phone in bed',
    category: 'Sleep',
    color: '#6B7280',
    icon: 'moon',
    frequencyType: 'daily',
    rate: 0.5,
    startOffset: 89,
    archivedOffset: 20,
  },
];

/** Deterministic number in [0, 1) for a given string (same input -> same number, every run). */
function chance(key) {
  return crypto.createHash('sha256').update(key).digest().readUInt32BE(0) / 2 ** 32;
}

/** Whether `habit` is completed on `date` (a Luxon DateTime in the demo timezone). */
function isCompleted(habit, date) {
  const roll = chance(`${habit.n}:${date.toISODate()}`);
  if (habit.frequencyType === 'weekly_target') {
    // Spread roughly targetPerWeek completions over 7 days; some weeks fall short (missed).
    return roll < (habit.targetPerWeek / 7) * 1.1;
  }
  if (habit.frequencyType === 'weekdays' && !habit.weekdays.includes(date.weekday)) return false;
  return roll < habit.rate;
}

function buildRows(today, now) {
  const habits = [];
  const scheduleDays = [];
  const completions = [];

  for (const habit of HABITS) {
    const startDate = today.minus({ days: habit.startOffset });
    const archivedDay = habit.archivedOffset ? today.minus({ days: habit.archivedOffset }) : null;

    habits.push({
      id: habitId(habit.n),
      workspace_id: WORKSPACE_ID,
      created_by: USER_ID,
      name: habit.name,
      description: habit.description ?? null,
      category: habit.category,
      color: habit.color,
      icon: habit.icon,
      frequency_type: habit.frequencyType,
      target_per_week: habit.targetPerWeek ?? null,
      start_date: startDate.toISODate(),
      status: archivedDay ? 'archived' : 'active',
      archived_at: archivedDay ? archivedDay.set({ hour: 21 }).toUTC().toJSDate() : null,
      sort_order: habit.n,
    });

    for (const weekday of habit.weekdays ?? []) {
      scheduleDays.push({ habit_id: habitId(habit.n), weekday });
    }

    // Walk every day from the start up to today (or the archive day).
    const lastDay = archivedDay ?? today;
    for (let day = startDate; day <= lastDay; day = day.plus({ days: 1 })) {
      if (!isCompleted(habit, day)) continue;
      // Pretend it was ticked off at a plausible local time, but never in the future.
      const minutesIntoDay =
        7 * 60 + Math.floor(chance(`time:${habit.n}:${day.toISODate()}`) * 15 * 60);
      const tickedAt = DateTime.min(day.plus({ minutes: minutesIntoDay }), now);
      completions.push({
        habit_id: habitId(habit.n),
        completed_by: USER_ID,
        completion_date: day.toISODate(),
        completed_at: tickedAt.toUTC().toJSDate(),
      });
    }
  }
  return { habits, scheduleDays, completions };
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // sequelize-cli itself defaults to 'development' when NODE_ENV is unset.
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      throw new Error('The demo-data seeder must never run in production (NODE_ENV=production).');
    }
    if (nodeEnv !== 'development') return;

    // "Today" in the demo user's timezone, never the server's local time (CLAUDE.md §3.1).
    const now = DateTime.now().setZone(TIMEZONE);
    const today = now.startOf('day');
    const { habits, scheduleDays, completions } = buildRows(today, now);
    // Same scheme as src/utils/password.js (ADR-030): bcrypt(base64(sha256(password))).
    // Repeated here because this CommonJS file can't import that ES module.
    const prehashed = crypto.createHash('sha256').update('habitflow-demo', 'utf8').digest('base64');
    const passwordHash = await bcrypt.hash(prehashed, BCRYPT_COST);
    // ON CONFLICT DO NOTHING: rows that already exist are skipped, not duplicated or changed.
    const ignore = { ignoreDuplicates: true };

    await queryInterface.sequelize.transaction(async (transaction) => {
      const opts = { ...ignore, transaction };
      await queryInterface.bulkInsert(
        'users',
        [
          {
            id: USER_ID,
            name: 'Demo User',
            email: 'demo@habitflow.local',
            password_hash: passwordHash,
            timezone: TIMEZONE,
            // Raw inserts skip the model, so JSONB values are passed as JSON text.
            notification_preferences: JSON.stringify({ inApp: true, reminders: true }),
          },
        ],
        opts,
      );
      // Always reset the demo password, so the documented login works even for a demo user
      // created by an older version of this seeder (or whose password was changed).
      await queryInterface.bulkUpdate(
        'users',
        { password_hash: passwordHash },
        { id: USER_ID },
        { transaction },
      );
      await queryInterface.bulkInsert(
        'workspaces',
        [
          {
            id: WORKSPACE_ID,
            name: 'Personal',
            owner_user_id: USER_ID,
            workspace_type: 'personal',
          },
        ],
        opts,
      );
      await queryInterface.bulkInsert(
        'workspace_members',
        [{ id: MEMBER_ID, workspace_id: WORKSPACE_ID, user_id: USER_ID, role: 'owner' }],
        opts,
      );
      await queryInterface.bulkInsert('habits', habits, opts);
      await queryInterface.bulkInsert('habit_schedule_days', scheduleDays, opts);
      await queryInterface.bulkInsert('habit_completions', completions, opts);
      await queryInterface.bulkInsert(
        'habit_reminders',
        [
          { habit_id: habitId(1), user_id: USER_ID, remind_at: '09:00', weekdays: null },
          { habit_id: habitId(3), user_id: USER_ID, remind_at: '18:30', weekdays: [1, 3, 5] },
        ],
        opts,
      );
      await queryInterface.bulkInsert(
        'notifications',
        [
          {
            user_id: USER_ID,
            type: 'system',
            title: 'Welcome to HabitFlow',
            message: 'This is demo data. Tick off a habit to see your streaks update.',
            data: JSON.stringify({}),
            dedupe_key: `demo:welcome:${USER_ID}`,
          },
        ],
        opts,
      );
    });
  },

  async down(queryInterface) {
    if (process.env.NODE_ENV === 'production') return;
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Deleting the workspace cascades to members, habits, schedule days, completions and
      // reminders; deleting the user then cascades to sessions and notifications.
      await queryInterface.bulkDelete('workspaces', { id: WORKSPACE_ID }, { transaction });
      await queryInterface.bulkDelete('users', { id: USER_ID }, { transaction });
    });
  },
};
