/**
 * Analytics: completion rates and summaries over a date range (PRD 4.5, CLAUDE.md §3.1
 * "Completion rate", docs/STREAK_RULES.md §8). Pure functions; analyticsService loads the data.
 *
 * The central idea is a SCHEDULED INSTANCE: one thing the user was due to do.
 *   daily / weekdays  one instance per scheduled DAY
 *   weekly_target     one instance per ISO WEEK, complete when completions >= that week's target
 * completion rate = completed instances / scheduled instances, or null when nothing was due.
 *
 * Nothing in progress may lower a rate (no punitive feedback):
 *   - today counts only once it is completed (a pending today is left out);
 *   - the current week counts only once its target is met;
 *   - an archived habit is evaluated only up to its archive date (`asOf`), so the days after
 *     archiving are never "missed".
 */
import { addDays, eachDay, weekBounds } from './dates.js';
import { isScheduledOn } from './schedule.js';
import { computeStreak, dayStatus, weekTarget } from './streaks.js';

/**
 * Rounded rate, or null when the denominator is 0 (the UI then shows an empty state, not 0%).
 * @param {number} completed
 * @param {number} scheduled
 * @returns {number | null} a fraction 0..1 with at most 4 decimals
 */
export function completionRate(completed, scheduled) {
  if (scheduled === 0) return null;
  return Math.round((completed / scheduled) * 10_000) / 10_000;
}

/**
 * The instances of one habit that were DUE between `from` and `to` (inclusive).
 *
 * Days: scheduled days from max(from, startDate) to min(to, today); `today` itself only if done.
 * Weeks: every ISO week that overlaps the range (evaluated on ALL of that week's completions),
 * from the habit's first week; a finished week always counts, the week containing `today` only
 * once its target is met, later weeks never. The first week uses the prorated target (ADR-038).
 *
 * @param {object} input
 * @param {{ frequencyType: string, startDate: string, targetPerWeek?: number | null }} input.habit
 * @param {Iterable<number | { weekday: number }>} input.scheduleDays
 * @param {Iterable<string>} input.completionDates the user's completion dates for this habit
 * @param {string} input.from 'YYYY-MM-DD'
 * @param {string} input.to 'YYYY-MM-DD'
 * @param {string} input.today the evaluation date: today in the user's timezone, or the archive
 *   date for an archived habit
 * @returns {{ unit: 'days' | 'weeks',
 *   instances: ({ date: string, completed: boolean } | { weekStart: string, completed: boolean })[] }}
 */
export function scheduledInstances({ habit, scheduleDays, completionDates, from, to, today }) {
  // Same counting rule as the streaks: scheduled, on/after startDate, not after today.
  const done = new Set();
  for (const date of completionDates) {
    if (date <= today && isScheduledOn(habit, scheduleDays, date)) done.add(date);
  }
  const first = from > habit.startDate ? from : habit.startDate;
  const last = to < today ? to : today;

  if (habit.frequencyType !== 'weekly_target') {
    const instances = [];
    for (const date of eachDay(first, last)) {
      if (!isScheduledOn(habit, scheduleDays, date)) continue;
      if (date === today && !done.has(date)) continue; // pending today: not due yet
      instances.push({ date, completed: done.has(date) });
    }
    return { unit: 'days', instances };
  }

  const instances = [];
  if (first > last) return { unit: 'weeks', instances };
  for (
    let weekStart = weekBounds(first).start;
    weekStart <= last;
    weekStart = addDays(weekStart, 7)
  ) {
    const weekEnd = addDays(weekStart, 6);
    let count = 0;
    for (const date of done) if (date >= weekStart && date <= weekEnd) count += 1;
    const met = count >= weekTarget(habit, weekStart);
    // A week still running (it contains `today`) is only due once it has been met.
    if (weekEnd < today || met) instances.push({ weekStart, completed: met });
  }
  return { unit: 'weeks', instances };
}

/**
 * @typedef {object} HabitEntry one habit's data for summarize()
 * @property {{ id: string, name: string, category: string | null, status: string,
 *   frequencyType: string, startDate: string, targetPerWeek?: number | null }} habit
 * @property {Iterable<number | { weekday: number }>} scheduleDays
 * @property {string[]} completionDates the user's completions of this habit (full history)
 * @property {string} asOf evaluation date: today, or the archive date (in the user's tz) if earlier
 */

/**
 * Builds every analytics block for a range, in memory, from already-loaded data.
 *
 * @param {{ entries: HabitEntry[], from: string, to: string, today: string }} params
 *   entries in display order (sortOrder)
 * @returns {object} { today, overall, bestStreak, daily, weekly, byHabit, byCategory }; see
 *   docs/API.md for the response shape
 */
export function summarize({ entries, from, to, today }) {
  const daily = new Map(
    eachDay(from, to).map((date) => [date, { date, scheduled: 0, completed: 0 }]),
  );
  const weekly = new Map();
  for (let weekStart = weekBounds(from).start; weekStart <= to; weekStart = addDays(weekStart, 7)) {
    weekly.set(weekStart, { weekStart, scheduled: 0, completed: 0 });
  }
  const add = (bucket, completed) => {
    bucket.scheduled += 1;
    if (completed) bucket.completed += 1;
  };

  const overall = { scheduled: 0, completed: 0 };
  const categories = new Map();
  const byHabit = [];
  const todayBlock = { scheduled: 0, completed: 0, remaining: 0 };

  for (const { habit, scheduleDays, completionDates, asOf } of entries) {
    const { unit, instances } = scheduledInstances({
      habit,
      scheduleDays,
      completionDates,
      from,
      to,
      today: asOf,
    });
    const totals = { scheduled: 0, completed: 0 };
    for (const instance of instances) {
      add(totals, instance.completed);
      if (unit === 'days') {
        add(daily.get(instance.date), instance.completed);
        add(weekly.get(weekBounds(instance.date).start), instance.completed);
      } else {
        add(weekly.get(instance.weekStart), instance.completed);
      }
    }
    overall.scheduled += totals.scheduled;
    overall.completed += totals.completed;

    const categoryKey = habit.category ?? null;
    const category = categories.get(categoryKey) ?? {
      category: categoryKey,
      scheduled: 0,
      completed: 0,
    };
    category.scheduled += totals.scheduled;
    category.completed += totals.completed;
    categories.set(categoryKey, category);

    // Streaks are always as of the real today, like GET /habits/:id (ADR-040).
    const input = { habit, scheduleDays, completionDates, today };
    const streak = computeStreak(input);
    byHabit.push({
      habitId: habit.id,
      name: habit.name,
      category: habit.category ?? null,
      status: habit.status,
      completionRate: completionRate(totals.completed, totals.scheduled),
      completed: totals.completed,
      scheduled: totals.scheduled,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      unit: streak.unit,
    });

    // "Today" covers active habits only; archived habits are history, not today's work.
    if (habit.status === 'active' && isScheduledOn(habit, scheduleDays, today)) {
      const status = dayStatus({ ...input, date: today });
      todayBlock.scheduled += 1;
      if (status === 'completed') todayBlock.completed += 1;
      if (status === 'pending') todayBlock.remaining += 1;
    }
  }

  const best = byHabit.reduce(
    (top, item) => (item.longestStreak > (top?.longestStreak ?? 0) ? item : top),
    null,
  );
  const withRate = (bucket) => ({
    ...bucket,
    rate: completionRate(bucket.completed, bucket.scheduled),
  });

  return {
    today: {
      ...todayBlock,
      percent:
        todayBlock.scheduled === 0
          ? null
          : Math.round((todayBlock.completed / todayBlock.scheduled) * 100),
    },
    overall: {
      completionRate: completionRate(overall.completed, overall.scheduled),
      completed: overall.completed,
      scheduled: overall.scheduled,
    },
    bestStreak: best
      ? { habitId: best.habitId, name: best.name, longest: best.longestStreak, unit: best.unit }
      : null,
    daily: [...daily.values()].map(withRate),
    weekly: [...weekly.values()].map(withRate),
    byHabit,
    byCategory: [...categories.values()].map((c) => ({
      category: c.category,
      completionRate: completionRate(c.completed, c.scheduled),
      completed: c.completed,
      scheduled: c.scheduled,
    })),
  };
}

/**
 * Per-day status of one habit for a calendar view (GET /habits/:id/history).
 * Archived habits: days after the archive date (and an unfinished archive day) are
 * 'not_scheduled', because the habit wasn't being tracked any more.
 *
 * @param {{ habit: object, scheduleDays: Iterable<number | { weekday: number }>,
 *   completionDates: string[], from: string, to: string, today: string, asOf: string }} params
 * @returns {{ date: string, status: string, completed: boolean }[]}
 */
export function habitHistory({ habit, scheduleDays, completionDates, from, to, today, asOf }) {
  const doneDates = new Set(completionDates);
  return eachDay(from, to).map((date) => {
    let status = dayStatus({ habit, scheduleDays, completionDates, today: asOf, date });
    // Between the archive date and the real today: not tracked, so neither missed nor upcoming.
    if (asOf < today && date <= today && (status === 'pending' || status === 'upcoming')) {
      status = 'not_scheduled';
    }
    return { date, status, completed: doneDates.has(date) };
  });
}
