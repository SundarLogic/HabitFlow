/**
 * Habit scheduling rules (CLAUDE.md §3.1 "Schedules"), as pure functions with no database.
 * Services and later the streak/analytics code (Phase 5) call these, and unit tests can check
 * every rule without HTTP or SQL.
 */
import { isoWeekday } from './dates.js';

/**
 * Is `isoDate` a scheduled day for this habit?
 *
 *   daily          every day from startDate
 *   weekdays       only the ISO weekdays in scheduleDays
 *   weekly_target  every day (any day counts toward the weekly target)
 * Before startDate nothing is scheduled. The CURRENT schedule is used, including for past
 * dates: completions on days that are no longer scheduled are ignored (CLAUDE.md §3.1).
 *
 * @param {{ frequencyType: string, startDate: string }} habit
 * @param {Iterable<number | { weekday: number }>} scheduleDays ISO weekdays (1 = Mon ... 7 = Sun),
 *   as numbers or HabitScheduleDay rows; only used for `weekdays` habits
 * @param {string} isoDate 'YYYY-MM-DD'
 * @returns {boolean}
 * @throws {RangeError} if isoDate is not a real calendar date
 */
export function isScheduledOn(habit, scheduleDays, isoDate) {
  const weekday = isoWeekday(isoDate); // validates the date first, whatever the habit type
  if (isoDate < habit.startDate) return false;

  switch (habit.frequencyType) {
    case 'daily':
    case 'weekly_target':
      return true;
    case 'weekdays':
      for (const day of scheduleDays ?? []) {
        if ((typeof day === 'number' ? day : day.weekday) === weekday) return true;
      }
      return false;
    default:
      throw new RangeError(`Unknown frequencyType: ${habit.frequencyType}`);
  }
}
