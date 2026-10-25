/**
 * Reminder dispatch: sends the reminders that are due RIGHT NOW. Called once a minute by the
 * reminder scheduler (jobs/reminderScheduler.js), and directly by tests with a fake clock.
 *
 * How "due" is found efficiently (4 queries per tick, however many users or reminders):
 *   1. the distinct timezones of users with enabled reminders;
 *   2. for each timezone, its local date / time / weekday is computed with Luxon (the same code
 *      that decides "today" everywhere else in the app), then ONE query fetches the enabled
 *      reminders of active habits whose remind_at equals that local HH:mm;
 *   3. the habits' schedule days; 4. the relevant completions.
 *
 * A reminder is skipped when: its weekdays exclude today, the habit isn't scheduled today, it is
 * already completed today, or (weekly_target) this week's target is already met.
 *
 * Exactly-once: each notification gets dedupe_key `reminder:{reminderId}:{localDate}`, inserted
 * with ON CONFLICT DO NOTHING. A second tick in the same minute, a restart, or several server
 * instances can never notify twice for the same reminder and day.
 */
import { Op, QueryTypes } from 'sequelize';
import { isoWeekday, localTimeIn, todayIn, weekBounds } from '../domain/dates.js';
import { isScheduledOn } from '../domain/schedule.js';
import { weekProgress } from '../domain/streaks.js';
import { Habit, HabitCompletion, sequelize } from '../models/index.js';
import { now as systemNow } from '../utils/clock.js';
import { dispatchNotification } from './notifications/index.js';

/** Reasons a due reminder was not sent (reported in the tick result and logs). */
const SKIP_REASONS = [
  'wrong_weekday',
  'not_scheduled',
  'completed',
  'target_met',
  'muted',
  'duplicate',
];

/** The local calendar facts for one timezone at this instant. */
function localMoment(timezone, now) {
  const date = todayIn(timezone, now);
  return { date, time: `${localTimeIn(timezone, now)}:00`, weekday: isoWeekday(date) };
}

/** Enabled reminders of active habits whose time is NOW in their user's timezone. */
async function findDueReminders(now) {
  const zones = await sequelize.query(
    `SELECT DISTINCT u.timezone
       FROM habit_reminders r JOIN users u ON u.id = r.user_id
      WHERE r.enabled`,
    { type: QueryTypes.SELECT },
  );
  if (zones.length === 0) return { due: [], local: new Map() };

  const local = new Map(zones.map(({ timezone }) => [timezone, localMoment(timezone, now)]));
  const replacements = {};
  const conditions = [...local].map(([timezone, moment], i) => {
    replacements[`tz${i}`] = timezone;
    replacements[`t${i}`] = moment.time;
    return `(u.timezone = :tz${i} AND r.remind_at = :t${i})`;
  });

  const due = await sequelize.query(
    `SELECT r.id AS "reminderId", r.habit_id AS "habitId", r.user_id AS "userId",
            r.weekdays, u.timezone, u.notification_preferences AS "notificationPreferences"
       FROM habit_reminders r
       JOIN users u ON u.id = r.user_id
       JOIN habits h ON h.id = r.habit_id
      WHERE r.enabled AND h.status = 'active' AND (${conditions.join(' OR ')})`,
    { replacements, type: QueryTypes.SELECT },
  );
  return { due, local };
}

/**
 * One scheduler tick: finds and sends every reminder due at `now`.
 *
 * @param {{ now?: () => Date, logger?: import('pino').Logger }} [deps]
 * @returns {Promise<{ considered: number, sent: number, failed: number,
 *   skipped: Record<string, number> }>}
 */
export async function dispatchDueReminders({ now = systemNow, logger } = {}) {
  const skipped = Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0]));
  const result = { considered: 0, sent: 0, failed: 0, skipped };

  const { due, local } = await findDueReminders(now);
  result.considered = due.length;
  if (due.length === 0) return result;

  const habitIds = [...new Set(due.map((r) => r.habitId))];
  const habits = new Map(
    (
      await Habit.findAll({
        where: { id: habitIds },
        include: [{ association: 'scheduleDays', attributes: ['weekday'] }],
      })
    ).map((habit) => [habit.id, habit]),
  );

  // Completions from the earliest Monday any user is in, up to the latest local date: enough
  // for "done today" and "weekly target met".
  const dates = [...local.values()].map((m) => m.date).sort();
  const completions = await HabitCompletion.findAll({
    attributes: ['habitId', 'completedBy', 'completionDate'],
    where: {
      habitId: habitIds,
      completedBy: [...new Set(due.map((r) => r.userId))],
      completionDate: { [Op.between]: [weekBounds(dates[0]).start, dates.at(-1)] },
    },
  });
  const doneBy = new Map(); // "habitId|userId" -> completion dates
  for (const c of completions) {
    const key = `${c.habitId}|${c.completedBy}`;
    doneBy.set(key, [...(doneBy.get(key) ?? []), c.completionDate]);
  }

  for (const reminder of due) {
    try {
      const reason = await sendOne(reminder, {
        habit: habits.get(reminder.habitId),
        moment: local.get(reminder.timezone),
        completionDates: doneBy.get(`${reminder.habitId}|${reminder.userId}`) ?? [],
      });
      if (reason === 'sent') result.sent += 1;
      else skipped[reason] += 1;
    } catch (err) {
      // One broken reminder must not stop everyone else's.
      result.failed += 1;
      logger?.error({ err, reminderId: reminder.reminderId }, 'Reminder dispatch failed');
    }
  }
  return result;
}

/** Applies the skip rules to one due reminder and sends it. Returns 'sent' or a skip reason. */
async function sendOne(reminder, { habit, moment, completionDates }) {
  if (reminder.weekdays && !reminder.weekdays.includes(moment.weekday)) return 'wrong_weekday';
  if (!isScheduledOn(habit, habit.scheduleDays, moment.date)) return 'not_scheduled';
  if (completionDates.includes(moment.date)) return 'completed';

  let message = `It's time for "${habit.name}".`;
  if (habit.frequencyType === 'weekly_target') {
    const progress = weekProgress({
      habit,
      scheduleDays: habit.scheduleDays,
      completionDates,
      today: moment.date,
    });
    if (progress && progress.done >= progress.target) return 'target_met';
    message = `It's time for "${habit.name}": ${progress.done} of ${progress.target} done this week.`;
  }

  const results = await dispatchNotification({
    user: { id: reminder.userId, notificationPreferences: reminder.notificationPreferences },
    type: 'habit_reminder',
    title: habit.name,
    message,
    data: { habitId: habit.id, reminderId: reminder.reminderId, date: moment.date },
    dedupeKey: `reminder:${reminder.reminderId}:${moment.date}`,
  });
  if (results.length === 0) return 'muted';
  return results.some((r) => r.delivered) ? 'sent' : 'duplicate';
}
