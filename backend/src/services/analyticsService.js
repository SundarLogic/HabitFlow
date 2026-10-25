/**
 * Analytics service: loads habits and completions, then lets the pure functions in
 * domain/analytics.js do all the maths in memory (PRD 4.5, docs/STREAK_RULES.md §8).
 *
 * Request flow: analyticsRoutes / habitRoutes -> validators -> analyticsController -> THIS FILE.
 *
 * Query budget: every endpoint here runs exactly TWO queries, however many habits exist:
 *   1. the workspace's habits with their schedule days;
 *   2. the user's completions for those habits, from the earliest start date up to today
 *      (the full history is needed for streaks; a test counts the queries).
 */
import { addDays, todayIn, weekBounds } from '../domain/dates.js';
import { habitHistory, summarize } from '../domain/analytics.js';
import { Habit } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';
import { now as systemNow } from '../utils/clock.js';
import { loadCompletions } from './streakService.js';

/** Default range: the last 30 days, today included. */
const DEFAULT_RANGE_DAYS = 30;

/** The date an archived habit stops being evaluated: its archive day in the user's timezone. */
function evaluationDate(habit, timezone, today) {
  if (habit.status !== 'archived' || !habit.archivedAt) return today;
  const archivedOn = todayIn(timezone, () => habit.archivedAt);
  return archivedOn < today ? archivedOn : today;
}

/**
 * Loads the habits (optionally one, optionally without archived ones) and the user's
 * completions for them, as entries for domain/analytics.js.
 * @throws {NotFoundError} when habitId is given but isn't in this workspace
 */
async function loadEntries({ workspace, user, habitId, includeArchived, today }) {
  const where = { workspaceId: workspace.id };
  if (habitId)
    where.id = habitId; // a habit asked for by id is returned even if archived
  else if (!includeArchived) where.status = 'active';

  const habits = await Habit.findAll({
    where,
    include: [{ association: 'scheduleDays', attributes: ['weekday'] }],
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (habitId && habits.length === 0) throw new NotFoundError('Habit not found');

  const earliestStart = habits.reduce(
    (earliest, habit) => (habit.startDate < earliest ? habit.startDate : earliest),
    today,
  );
  const completionsByHabit = await loadCompletions({
    habitIds: habits.map((habit) => habit.id),
    userId: user.id,
    from: earliestStart,
    to: today,
  });

  return habits.map((habit) => ({
    habit,
    scheduleDays: habit.scheduleDays,
    completionDates: completionsByHabit.get(habit.id).map((c) => c.completionDate),
    asOf: evaluationDate(habit, user.timezone, today),
  }));
}

/**
 * GET /analytics/summary: every dashboard block for a range.
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string }, from?: string,
 *   to?: string, habitId?: string, includeArchived?: boolean, now?: () => Date }} params
 *   from/to default to the last 30 days (today included)
 * @returns {Promise<object>} { range, today, overall, bestStreak, daily, weekly, byHabit,
 *   byCategory } (see docs/API.md)
 */
export async function getSummary({
  workspace,
  user,
  from,
  to,
  habitId,
  includeArchived = true,
  now = systemNow,
}) {
  const today = todayIn(user.timezone, now);
  const range = from
    ? { from, to }
    : { from: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today };
  const entries = await loadEntries({ workspace, user, habitId, includeArchived, today });
  return { range, ...summarize({ entries, ...range, today }) };
}

/**
 * GET /analytics/heatmap: completed vs scheduled per day, for a calendar heatmap.
 * Day-based habits only (a weekly target has no per-day instance; ADR-041).
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string }, year?: number,
 *   from?: string, to?: string, now?: () => Date }} params default: the current year
 * @returns {Promise<{ range: { from: string, to: string },
 *   data: { date: string, completed: number, scheduled: number }[] }>}
 */
export async function getHeatmap({ workspace, user, year, from, to, now = systemNow }) {
  const today = todayIn(user.timezone, now);
  let range;
  if (from) range = { from, to };
  else {
    const y = year ?? Number(today.slice(0, 4));
    range = { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const entries = await loadEntries({ workspace, user, includeArchived: true, today });
  const { daily } = summarize({ entries, ...range, today });
  return {
    range,
    data: daily.map(({ date, completed, scheduled }) => ({ date, completed, scheduled })),
  };
}

/**
 * GET /habits/:id/history: the status of one habit on every day of a range, for the habit
 * detail calendar.
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string }, habitId: string,
 *   from?: string, to?: string, now?: () => Date }} params default: the last 30 days
 * @returns {Promise<{ habitId: string, range: { from: string, to: string },
 *   data: { date: string, status: string, completed: boolean }[] }>}
 */
export async function getHabitHistory({ workspace, user, habitId, from, to, now = systemNow }) {
  const today = todayIn(user.timezone, now);
  const range = from
    ? { from, to }
    : { from: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today };

  const habit = await Habit.findOne({
    where: { id: habitId, workspaceId: workspace.id },
    include: [{ association: 'scheduleDays', attributes: ['weekday'] }],
  });
  if (!habit) throw new NotFoundError('Habit not found');

  // Whole weeks are needed for weekly_target statuses, so start at the Monday of `from`.
  const completions = (
    await loadCompletions({
      habitIds: [habit.id],
      userId: user.id,
      from: weekBounds(range.from).start,
      to: today,
    })
  ).get(habit.id);

  return {
    habitId: habit.id,
    range,
    data: habitHistory({
      habit,
      scheduleDays: habit.scheduleDays,
      completionDates: completions.map((c) => c.completionDate),
      ...range,
      today,
      asOf: evaluationDate(habit, user.timezone, today),
    }),
  };
}
