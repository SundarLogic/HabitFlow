/**
 * Loads what the pure streak functions (domain/streaks.js) need from the database.
 *
 * Streaks need a user's FULL completion history for a habit (the longest streak can be months
 * old), so this loads completion DATES only, for many habits in ONE query. Callers must never
 * query per habit in a loop (the "N+1 queries" problem).
 */
import { Op } from 'sequelize';
import { HabitCompletion } from '../models/index.js';
import { computeStreak } from '../domain/streaks.js';

/**
 * One user's completions for several habits between two dates (inclusive), in ONE query.
 * @param {{ habitIds: string[], userId: string, from: string, to: string }} params
 * @returns {Promise<Map<string, HabitCompletion[]>>} habitId -> completions in date order
 *   (every requested habit has an entry, possibly empty)
 */
export async function loadCompletions({ habitIds, userId, from, to }) {
  const byHabit = new Map(habitIds.map((id) => [id, []]));
  if (habitIds.length === 0) return byHabit;

  const rows = await HabitCompletion.findAll({
    where: {
      habitId: habitIds,
      completedBy: userId,
      completionDate: { [Op.between]: [from, to] },
    },
    order: [['completionDate', 'ASC']],
  });
  for (const row of rows) byHabit.get(row.habitId).push(row);
  return byHabit;
}

/**
 * Streak summary for one habit, as of `today`.
 * @param {import('../models/Habit.js').Habit} habit loaded with scheduleDays
 * @param {HabitCompletion[]} completions this user's completions of the habit
 * @param {string} today in the user's timezone
 */
export function streakFor(habit, completions, today) {
  return computeStreak({
    habit,
    scheduleDays: habit.scheduleDays ?? [],
    completionDates: completions.map((c) => c.completionDate),
    today,
  });
}
