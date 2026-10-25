/**
 * Streaks, day statuses and weekly progress (CLAUDE.md §3.1 "Streaks", docs/STREAK_RULES.md).
 *
 * Pure functions: the caller passes the habit, its schedule days, the user's completion dates
 * and "today" (already computed in the USER's timezone with todayIn()). Nothing here reads the
 * clock or the database, so every rule is unit-tested in tests/unit/streaks.test.js.
 *
 * Streaks are DERIVED from completion history on every read, never stored (ADR-007), so editing
 * a past completion automatically changes the result.
 *
 * Which completions count: only those on a day that is scheduled under the habit's CURRENT
 * schedule, on or after startDate, and not after today. Others (e.g. a Tuesday completion of a
 * habit now scheduled Mon/Wed/Fri) are kept in the database but ignored here.
 */
import { addDays, daysBetween, weekBounds } from './dates.js';
import { isScheduledOn } from './schedule.js';

/**
 * @typedef {object} HabitLike
 * @property {'daily' | 'weekdays' | 'weekly_target'} frequencyType
 * @property {string} startDate 'YYYY-MM-DD'
 * @property {number | null} [targetPerWeek] required for weekly_target
 *
 * @typedef {object} StreakInput
 * @property {HabitLike} habit
 * @property {Iterable<number | { weekday: number }>} scheduleDays ISO weekdays (weekdays habits)
 * @property {Iterable<string>} completionDates the user's completion dates, any order
 * @property {string} today today in the user's timezone, 'YYYY-MM-DD'
 *
 * @typedef {'completed' | 'pending' | 'missed' | 'not_scheduled' | 'upcoming'} DayStatus
 */

/** The completion dates that count (scheduled, >= startDate, <= today), as a Set. */
function countedCompletions({ habit, scheduleDays, completionDates, today }) {
  const counted = new Set();
  for (const date of completionDates) {
    if (date <= today && isScheduledOn(habit, scheduleDays, date)) counted.add(date);
  }
  return counted;
}

// ---------------------------------------------------------------------------------------------
// Weekly-target helpers
// ---------------------------------------------------------------------------------------------

/**
 * The target for the ISO week starting on `weekStart` (a Monday).
 *
 * PRORATED FIRST WEEK (ADR-038): when startDate is not a Monday, the first week only has
 * the days from startDate to Sunday, so its target is min(targetPerWeek, days left).
 * Example: target 5, start on Friday -> Fri, Sat, Sun = 3 days -> first-week target 3.
 * Every later week uses the full targetPerWeek.
 *
 * @param {HabitLike} habit
 * @param {string} weekStart Monday 'YYYY-MM-DD'
 * @returns {number}
 */
export function weekTarget(habit, weekStart) {
  const first = weekBounds(habit.startDate);
  if (weekStart !== first.start) return habit.targetPerWeek;
  const daysInFirstWeek = daysBetween(habit.startDate, first.end) + 1;
  return Math.min(habit.targetPerWeek, daysInFirstWeek);
}

/** Map of week start (Monday) -> number of counted completions in that week. */
function countsPerWeek(counted) {
  const counts = new Map();
  for (const date of counted) {
    const { start } = weekBounds(date);
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  return counts;
}

/**
 * Progress in the ISO week containing `date`: { done, target }.
 * @param {StreakInput & { date?: string }} input date defaults to today
 * @returns {{ done: number, target: number } | null} null before the habit's first week
 */
export function weekProgress(input) {
  const { habit, today, date = today } = input;
  const { start } = weekBounds(date);
  if (start < weekBounds(habit.startDate).start) return null;
  const counts = countsPerWeek(countedCompletions(input));
  return { done: counts.get(start) ?? 0, target: weekTarget(habit, start) };
}

// ---------------------------------------------------------------------------------------------
// Day status
// ---------------------------------------------------------------------------------------------

/**
 * The status of one day for this habit, as seen from `today`.
 *
 * daily / weekdays (a day is the unit):
 *   not_scheduled  before startDate, or a weekday the habit doesn't run on
 *   upcoming       after today
 *   completed      a completion exists
 *   pending        today, not yet completed (never a failure)
 *   missed         a past scheduled day without a completion
 *
 * weekly_target (the WEEK is the unit; a day reports what is still needed):
 *   not_scheduled  before startDate
 *   upcoming       after today
 *   completed      a completion exists on that day, OR its week already met the target
 *   pending        not completed and the week is still in progress (never a failure)
 *   missed         not completed and the week ended below target
 *
 * @param {StreakInput & { date: string }} input
 * @returns {DayStatus}
 */
export function dayStatus(input) {
  const { habit, scheduleDays, today, date } = input;
  if (date < habit.startDate) return 'not_scheduled';
  if (date > today) return 'upcoming';

  const counted = countedCompletions(input);
  if (habit.frequencyType === 'weekly_target') {
    const { start, end } = weekBounds(date);
    const done = countsPerWeek(counted).get(start) ?? 0;
    if (counted.has(date) || done >= weekTarget(habit, start)) return 'completed';
    return end >= today ? 'pending' : 'missed';
  }

  if (!isScheduledOn(habit, scheduleDays, date)) return 'not_scheduled';
  if (counted.has(date)) return 'completed';
  return date === today ? 'pending' : 'missed';
}

// ---------------------------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------------------------

/** The latest scheduled day strictly before `date` (not before startDate), or null. */
function previousScheduledDay(habit, scheduleDays, date) {
  for (let day = addDays(date, -1); day >= habit.startDate; day = addDays(day, -1)) {
    if (isScheduledOn(habit, scheduleDays, day)) return day;
  }
  return null;
}

/** The first scheduled day strictly after `date`, looking at most one week ahead, or null. */
function nextScheduledDay(habit, scheduleDays, date) {
  let day = date;
  for (let step = 0; step < 7; step += 1) {
    day = addDays(day, 1);
    if (isScheduledOn(habit, scheduleDays, day)) return day;
  }
  return null;
}

/** Streaks counted in scheduled DAYS (daily and weekdays habits). */
function dayStreaks(input, counted) {
  const { habit, scheduleDays, today } = input;

  // Current streak: walk backwards over scheduled days only. A scheduled-but-unfinished today is
  // PENDING: start from the previous scheduled day instead of breaking the streak.
  let cursor =
    isScheduledOn(habit, scheduleDays, today) && counted.has(today)
      ? today
      : previousScheduledDay(habit, scheduleDays, today);
  let current = 0;
  let currentStart = null; // first day of the current run (for milestone de-duplication)
  while (cursor !== null && counted.has(cursor)) {
    current += 1;
    currentStart = cursor;
    cursor = previousScheduledDay(habit, scheduleDays, cursor);
  }

  // Longest streak: in date order, a completion extends the run when it falls on the very next
  // scheduled day after the previous completion (unscheduled days in between don't matter).
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const date of [...counted].sort()) {
    run =
      previous !== null && nextScheduledDay(habit, scheduleDays, previous) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest, currentStart };
}

/** Streaks counted in ISO WEEKS (weekly_target habits). */
function weekStreaks(input, counted) {
  const { habit, today } = input;
  if (today < habit.startDate) return { current: 0, longest: 0, currentStart: null };

  const counts = countsPerWeek(counted);
  const met = (weekStart) => (counts.get(weekStart) ?? 0) >= weekTarget(habit, weekStart);
  const firstWeek = weekBounds(habit.startDate).start;
  const currentWeek = weekBounds(today).start;

  // Current: +1 if THIS week already met its target; an unmet current week is pending and
  // simply not counted. Then count met weeks backwards until the first missed one.
  let current = met(currentWeek) ? 1 : 0;
  let currentStart = current ? currentWeek : null; // Monday of the run's first week
  for (let week = addDays(currentWeek, -7); week >= firstWeek; week = addDays(week, -7)) {
    if (!met(week)) break;
    current += 1;
    currentStart = week;
  }

  // Longest: longest run of consecutive met weeks from the first week to this week.
  let longest = 0;
  let run = 0;
  for (let week = firstWeek; week <= currentWeek; week = addDays(week, 7)) {
    run = met(week) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current, longest, currentStart };
}

/**
 * Where the CURRENT streak began: its first day (daily / weekdays) or the Monday of its first
 * week (weekly_target), or null when there is no current streak. It identifies "this run" so a
 * milestone is announced once per run, however often the same day is marked and unmarked.
 * @param {StreakInput} input
 * @returns {string | null}
 */
export function currentRunStart(input) {
  const counted = countedCompletions(input);
  const streaks =
    input.habit.frequencyType === 'weekly_target'
      ? weekStreaks(input, counted)
      : dayStreaks(input, counted);
  return streaks.currentStart;
}

/**
 * Current and longest streak, today's status and (weekly_target) this week's progress.
 *
 * @param {StreakInput} input
 * @returns {{ current: number, longest: number, unit: 'days' | 'weeks', status: DayStatus,
 *   weekProgress?: { done: number, target: number } | null }}
 */
export function computeStreak(input) {
  const counted = countedCompletions(input);
  const status = dayStatus({ ...input, date: input.today });

  if (input.habit.frequencyType === 'weekly_target') {
    const { current, longest } = weekStreaks(input, counted);
    return { current, longest, unit: 'weeks', status, weekProgress: weekProgress(input) };
  }
  const { current, longest } = dayStreaks(input, counted);
  return { current, longest, unit: 'days', status };
}
