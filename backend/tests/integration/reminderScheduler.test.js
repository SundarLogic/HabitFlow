/**
 * The reminder scheduler tick (jobs/reminderScheduler.js -> reminderDispatchService), run
 * directly with a FAKE CLOCK, without node-cron.
 *
 * One instant, three timezones: 2026-10-28 13:00 UTC is
 *   New York  09:00 Wednesday 28   (UTC-4)
 *   Kolkata   18:30 Wednesday 28   (UTC+5:30)
 *   Auckland  02:00 Thursday  29   (UTC+13)
 * Each user has a reminder at their local time, so all three are due at this same instant.
 */
import { createLogger } from '../../src/config/logger.js';
import { runReminderTick } from '../../src/jobs/reminderScheduler.js';
import { Notification, sequelize } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const INSTANT = new Date('2026-10-28T13:00:00Z');
const app = createTestApp({ now: () => INSTANT });
const logger = createLogger({ level: 'silent' });
const tick = (at = INSTANT) => runReminderTick({ now: () => at, logger });

/** Signs a user up in `timezone` with one daily habit and a reminder at `remindAt`. */
async function userWithReminder(timezone, remindAt, habitOverrides = {}, reminderOverrides = {}) {
  const ctx = await signupAgent(app, { timezone });
  const habit = await createHabitViaApi(ctx, { startDate: '2026-10-01', ...habitOverrides });
  const res = await call(ctx, 'post', `/api/v1/habits/${habit.id}/reminders`, {
    remindAt,
    ...reminderOverrides,
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return { ctx, habit, reminder: res.body.reminder };
}

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

describe('due reminders across timezones', () => {
  it("sends each reminder at its user's local time, keyed by the user's local date", async () => {
    const ny = await userWithReminder('America/New_York', '09:00');
    const kol = await userWithReminder('Asia/Kolkata', '18:30');
    const akl = await userWithReminder('Pacific/Auckland', '02:00');
    await userWithReminder('America/New_York', '09:01'); // a minute later: not due yet

    const result = await tick();
    expect(result).toMatchObject({ considered: 3, sent: 3, failed: 0 });

    const rows = await Notification.findAll({ order: [['dedupeKey', 'ASC']] });
    expect(rows.map((n) => n.dedupeKey).sort()).toEqual(
      [
        `reminder:${ny.reminder.id}:2026-10-28`,
        `reminder:${kol.reminder.id}:2026-10-28`,
        `reminder:${akl.reminder.id}:2026-10-29`, // already Thursday in Auckland
      ].sort(),
    );
    const nyRow = rows.find((n) => n.userId === ny.ctx.user.id);
    expect(nyRow).toMatchObject({
      type: 'habit_reminder',
      title: 'Drink water',
      message: 'It\'s time for "Drink water".',
      data: { habitId: ny.habit.id, reminderId: ny.reminder.id, date: '2026-10-28' },
      readAt: null,
    });
  });

  it('the next minute sends the 09:01 reminder, and nothing else', async () => {
    await userWithReminder('America/New_York', '09:00');
    await userWithReminder('America/New_York', '09:01');
    await tick();
    const next = await tick(new Date('2026-10-28T13:01:00Z'));
    expect(next).toMatchObject({ considered: 1, sent: 1 });
    expect(await Notification.count()).toBe(2);
  });

  it('seconds inside the minute do not matter', async () => {
    await userWithReminder('America/New_York', '09:00');
    expect(await tick(new Date('2026-10-28T13:00:59Z'))).toMatchObject({ sent: 1 });
  });
});

describe('exactly once', () => {
  it('running the tick twice (or on two servers) creates no duplicates', async () => {
    await userWithReminder('America/New_York', '09:00');
    await userWithReminder('Pacific/Auckland', '02:00');

    expect(await tick()).toMatchObject({ sent: 2 });
    expect(await tick()).toMatchObject({
      sent: 0,
      skipped: expect.objectContaining({ duplicate: 2 }),
    });
    const [a, b] = await Promise.all([tick(), tick()]); // concurrent "instances"
    expect(a.sent + b.sent).toBe(0);
    expect(await Notification.count()).toBe(2);
  });
});

describe('skip rules', () => {
  it('skips a habit already completed today', async () => {
    const { ctx, habit } = await userWithReminder('America/New_York', '09:00');
    await call(ctx, 'put', `/api/v1/habits/${habit.id}/completions/2026-10-28`);
    expect(await tick()).toMatchObject({
      sent: 0,
      skipped: expect.objectContaining({ completed: 1 }),
    });
  });

  it('skips archived habits (they are not even considered)', async () => {
    const { ctx, habit } = await userWithReminder('America/New_York', '09:00');
    await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);
    expect(await tick()).toMatchObject({ considered: 0, sent: 0 });
  });

  it('skips a weekdays habit on a day it does not run (Wednesday for Tue/Thu)', async () => {
    await userWithReminder('America/New_York', '09:00', {
      frequencyType: 'weekdays',
      weekdays: [2, 4],
    });
    expect(await tick()).toMatchObject({
      sent: 0,
      skipped: expect.objectContaining({ not_scheduled: 1 }),
    });
  });

  it('skips a reminder whose own weekdays exclude today', async () => {
    await userWithReminder('America/New_York', '09:00', {}, { weekdays: [1] }); // Mondays only
    expect(await tick()).toMatchObject({
      sent: 0,
      skipped: expect.objectContaining({ wrong_weekday: 1 }),
    });
  });

  it('skips a weekly target already met this week, and reminds while it is not', async () => {
    const met = await userWithReminder('America/New_York', '09:00', {
      frequencyType: 'weekly_target',
      targetPerWeek: 1,
    });
    await call(met.ctx, 'put', `/api/v1/habits/${met.habit.id}/completions/2026-10-26`);
    const open = await userWithReminder('America/New_York', '09:00', {
      frequencyType: 'weekly_target',
      targetPerWeek: 3,
    });
    await call(open.ctx, 'put', `/api/v1/habits/${open.habit.id}/completions/2026-10-26`);

    const result = await tick();
    expect(result).toMatchObject({ sent: 1, skipped: expect.objectContaining({ target_met: 1 }) });
    const row = await Notification.findOne();
    expect(row.message).toBe('It\'s time for "Drink water": 1 of 3 done this week.');
  });

  it('skips disabled reminders', async () => {
    await userWithReminder('America/New_York', '09:00', {}, { enabled: false });
    expect(await tick()).toMatchObject({ considered: 0 });
  });

  it("respects the user's preferences (reminders off -> muted)", async () => {
    const { ctx } = await userWithReminder('America/New_York', '09:00');
    await call(ctx, 'patch', '/api/v1/users/me', { notificationPreferences: { reminders: false } });
    expect(await tick()).toMatchObject({ sent: 0, skipped: expect.objectContaining({ muted: 1 }) });
    expect(await Notification.count()).toBe(0);
  });
});

it('runs a fixed number of queries however many reminders are due', async () => {
  const countQueries = async () => {
    let count = 0;
    sequelize.addHook('beforeQuery', 'count', () => {
      count += 1;
    });
    try {
      await tick(new Date('2026-10-28T14:00:00Z')); // 10:00 in New York
    } finally {
      sequelize.removeHook('beforeQuery', 'count');
    }
    return count;
  };
  await userWithReminder('America/New_York', '10:00');
  await userWithReminder('Asia/Kolkata', '10:00'); // another timezone, not due
  const withOne = await countQueries();
  const lookups = withOne - 1; // everything except the single notification INSERT

  await truncateAllTables({ except: ['plans'] });
  for (let i = 0; i < 4; i += 1) await userWithReminder('America/New_York', '10:00');
  await userWithReminder('Asia/Kolkata', '10:00');
  // Same lookups, plus exactly one INSERT per due reminder: no per-reminder queries.
  expect(await countQueries()).toBe(lookups + 4);
  expect(lookups).toBe(4);
});
