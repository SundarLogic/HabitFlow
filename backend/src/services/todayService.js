/**
 * The daily overview behind GET /today: every active habit scheduled on a date, with its
 * completion, status, streak and weekly progress, plus a summary. It powers the dashboard in
 * ONE request with exactly two queries, however many habits there are:
 *   1. the active habits with their schedule days;
 *   2. all of the user's completions for those habits, from the earliest startDate on (one
 *      query, needed because the longest streak can lie far in the past).
 */
import { todayIn } from '../domain/dates.js';
import { isScheduledOn } from '../domain/schedule.js';
import { dayStatus, weekProgress } from '../domain/streaks.js';
import { Habit } from '../models/index.js';
import { now as systemNow } from '../utils/clock.js';
import { loadCompletions, streakFor } from './streakService.js';

/**
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string }, date?: string,
 *   now?: () => Date }} params date defaults to today in the user's timezone
 * @returns {Promise<{ date: string, today: string, items: object[],
 *   summary: { scheduled: number, completed: number, remaining: number, percent: number | null } }>}
 *   items: { habit, completed, completion, status, streak, weekProgress? }
 */
export async function getDayOverview({ workspace, user, date, now = systemNow }) {
  const today = todayIn(user.timezone, now);
  const day = date ?? today;

  const habits = await Habit.findAll({
    where: { workspaceId: workspace.id, status: 'active' },
    include: [{ association: 'scheduleDays', attributes: ['weekday'] }],
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  const scheduled = habits.filter((habit) => isScheduledOn(habit, habit.scheduleDays, day));

  const earliestStart = scheduled.reduce(
    (earliest, habit) => (habit.startDate < earliest ? habit.startDate : earliest),
    day,
  );
  const completionsByHabit = await loadCompletions({
    habitIds: scheduled.map((habit) => habit.id),
    userId: user.id,
    from: earliestStart,
    // Up to today for the streak, or up to `day` when looking ahead (nothing exists there yet).
    to: day > today ? day : today,
  });

  const items = scheduled.map((habit) => {
    const completions = completionsByHabit.get(habit.id);
    const input = {
      habit,
      scheduleDays: habit.scheduleDays,
      completionDates: completions.map((c) => c.completionDate),
      today,
    };
    const { current, longest, unit } = streakFor(habit, completions, today);
    const completion = completions.find((c) => c.completionDate === day) ?? null;
    return {
      habit,
      completed: completion !== null,
      completion,
      status: dayStatus({ ...input, date: day }),
      streak: { current, longest, unit },
      ...(habit.frequencyType === 'weekly_target'
        ? { weekProgress: weekProgress({ ...input, date: day }) }
        : {}),
    };
  });

  const completed = items.filter((item) => item.status === 'completed').length;
  return {
    date: day,
    today,
    items,
    summary: {
      scheduled: items.length,
      completed,
      remaining: items.filter((item) => item.status === 'pending').length,
      // CLAUDE.md §3.1: a 0 denominator is null (the UI shows an empty state), never 0% or NaN.
      percent: items.length === 0 ? null : Math.round((completed / items.length) * 100),
    },
  };
}
