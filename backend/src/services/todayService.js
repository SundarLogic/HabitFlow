/**
 * The daily overview behind GET /today: every active habit scheduled on a date, with its
 * completion, status, streak, weekly progress and "due" flag, plus a summary. It powers the
 * dashboard in ONE request with exactly three queries, however many habits there are:
 *   1. the active habits with their schedule days;
 *   2. all of the user's completions for those habits, from the earliest startDate on (one
 *      query, needed because the longest streak can lie far in the past);
 *   3. the user's enabled reminders for those habits (for isDue).
 *
 * isDue (PRD 4.6 "due indicator"): true when the viewed date is today, the habit is still pending,
 * and one of the user's reminders for it has a time that has already passed today (user tz) on a
 * weekday it applies to.
 */
import { isoWeekday, localTimeIn, todayIn } from '../domain/dates.js';
import { isScheduledOn } from '../domain/schedule.js';
import { dayStatus, weekProgress } from '../domain/streaks.js';
import { Habit, HabitReminder } from '../models/index.js';
import { now as systemNow } from '../utils/clock.js';
import { loadCompletions, streakFor } from './streakService.js';

/**
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string }, date?: string,
 *   now?: () => Date }} params date defaults to today in the user's timezone
 * @returns {Promise<{ date: string, today: string, items: object[],
 *   summary: { scheduled: number, completed: number, remaining: number, percent: number | null } }>}
 *   items: { habit, completed, completion, status, isDue, streak, weekProgress? }
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
  const reminders = await HabitReminder.findAll({
    where: { userId: user.id, enabled: true, habitId: scheduled.map((habit) => habit.id) },
  });
  // A reminder "has passed" when its HH:mm is at or before the current local time, on a weekday
  // it applies to. Only meaningful for today; other dates are never due.
  const nowTime = localTimeIn(user.timezone, now);
  const weekday = isoWeekday(today);
  const passedReminder = new Set(
    reminders
      .filter((r) => r.remindAt.slice(0, 5) <= nowTime)
      .filter((r) => !r.weekdays || r.weekdays.includes(weekday))
      .map((r) => r.habitId),
  );

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
    const status = dayStatus({ ...input, date: day });
    return {
      habit,
      completed: completion !== null,
      completion,
      status,
      isDue: day === today && status === 'pending' && passedReminder.has(habit.id),
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
