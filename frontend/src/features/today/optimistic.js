/**
 * Optimistic update of a GET /today result when a habit is ticked or unticked, so the UI responds
 * instantly. The server's answer replaces this guess moments later (the query is refetched), so
 * it only needs to be right about what the user SEES: the toggle, the status, the weekly progress
 * and the summary. Streak numbers are left alone until the refetch.
 *
 * Mirrors the status rules of docs/STREAK_RULES.md §3.
 */
import { weekEnd } from '../../lib/dates.js';

/** Status of a weekly-target day after the change (week = the unit). */
function weeklyStatus({ doneThatDay, weekDone, target, date, today }) {
  if (doneThatDay || weekDone >= target) return 'completed';
  return weekEnd(date) >= today ? 'pending' : 'missed';
}

/**
 * @param {{ date: string, today: string, habits: object[], summary: object }} data GET /today
 * @param {{ habitId: string, done: boolean }} change
 * @returns {object} a NEW object (never mutates the cache)
 */
export function applyToggle(data, { habitId, done }) {
  if (!data) return data;
  const habits = data.habits.map((item) => {
    if (item.habit.id !== habitId || item.completed === done) return item;

    const next = {
      ...item,
      completed: done,
      completion: done
        ? { id: 'optimistic', habitId, completionDate: data.date, note: null }
        : null,
      isDue: done ? false : item.isDue,
    };
    if (item.habit.frequencyType === 'weekly_target' && item.weekProgress) {
      const weekProgress = {
        ...item.weekProgress,
        done: Math.max(0, item.weekProgress.done + (done ? 1 : -1)),
      };
      next.weekProgress = weekProgress;
      next.status = weeklyStatus({
        doneThatDay: done,
        weekDone: weekProgress.done,
        target: weekProgress.target,
        date: data.date,
        today: data.today,
      });
    } else {
      next.status = done ? 'completed' : data.date === data.today ? 'pending' : 'missed';
    }
    return next;
  });

  const completed = habits.filter((h) => h.status === 'completed').length;
  return {
    ...data,
    habits,
    summary: {
      scheduled: habits.length,
      completed,
      remaining: habits.filter((h) => h.status === 'pending').length,
      percent: habits.length === 0 ? null : Math.round((completed / habits.length) * 100),
    },
  };
}
