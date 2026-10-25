/**
 * Streak milestones: a celebratory notification when a new completion makes the current streak
 * reach 7, 30, 100 or 365 (days, or weeks for weekly targets). Called by completionService right
 * after a completion is CREATED, inside the same transaction.
 *
 * Product principle (PRD): encouragement only. Nothing here, or anywhere, notifies a missed day.
 *
 * Once per run: the dedupe key contains the date the current run STARTED, so marking, unmarking
 * and re-marking the 7th day never celebrates twice, while a new run that reaches 7 again (after
 * a break) is celebrated again.
 */
import { Op } from 'sequelize';
import { computeStreak, currentRunStart } from '../domain/streaks.js';
import { HabitCompletion } from '../models/index.js';
import { dispatchNotification } from './notifications/index.js';

/** Streak lengths worth celebrating. */
export const STREAK_MILESTONES = Object.freeze([7, 30, 100, 365]);

/** Friendly copy for a milestone. */
function milestoneCopy(name, length, unit) {
  if (unit === 'weeks') {
    return {
      title: `${length}-week streak!`,
      message: `You've hit your "${name}" target ${length} weeks in a row. That's real consistency. Keep it going!`,
    };
  }
  return {
    title: `${length}-day streak!`,
    message: `You've completed "${name}" ${length} days in a row. That's real consistency. Keep it going!`,
  };
}

/**
 * Notifies the user if the completion on `date` made the current streak cross a milestone.
 * When a back-filled day crosses several at once (e.g. 5 -> 31), only the highest is celebrated.
 *
 * @param {object} params
 * @param {import('../models/Habit.js').Habit} params.habit
 * @param {Iterable<number>} params.scheduleDays
 * @param {{ id: string, notificationPreferences?: object }} params.user
 * @param {string} params.date the date just completed
 * @param {string} params.today today in the user's timezone
 * @param {import('sequelize').Transaction} params.transaction
 * @returns {Promise<number | null>} the milestone celebrated, or null
 */
export async function notifyStreakMilestone({
  habit,
  scheduleDays,
  user,
  date,
  today,
  transaction,
}) {
  const rows = await HabitCompletion.findAll({
    attributes: ['completionDate'],
    where: { habitId: habit.id, completedBy: user.id, completionDate: { [Op.lte]: today } },
    transaction,
  });
  const completionDates = rows.map((row) => row.completionDate);
  const input = { habit, scheduleDays, completionDates, today };

  const after = computeStreak(input);
  const before = computeStreak({
    ...input,
    completionDates: completionDates.filter((d) => d !== date),
  });
  const crossed = STREAK_MILESTONES.filter((n) => before.current < n && after.current >= n);
  if (crossed.length === 0) return null;

  const milestone = crossed.at(-1);
  await dispatchNotification({
    user,
    type: 'streak_milestone',
    ...milestoneCopy(habit.name, milestone, after.unit),
    data: { habitId: habit.id, streak: milestone, unit: after.unit },
    dedupeKey: `streak:${habit.id}:${user.id}:${milestone}:${currentRunStart(input)}`,
    transaction,
  });
  return milestone;
}
