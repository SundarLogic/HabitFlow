/**
 * Human-readable schedule text for a habit:
 *   daily                      "Every day"
 *   weekdays [1..5]            "Weekdays"        [6,7] "Weekends"     [1,3,5] "Mon, Wed, Fri"
 *   weekly_target 3            "3× per week"     with progress: "3× per week · 2/3 this week"
 */
import { WEEKDAYS } from './constants.js';

const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * @param {{ frequencyType: string, weekdays?: number[] | null, targetPerWeek?: number | null }} habit
 * @param {{ done: number, target: number } | null} [weekProgress] from GET /today
 * @returns {string}
 */
export function scheduleSummary(habit, weekProgress) {
  if (habit.frequencyType === 'daily') return 'Every day';
  if (habit.frequencyType === 'weekdays') {
    const days = [...(habit.weekdays ?? [])].sort((a, b) => a - b);
    if (sameDays(days, [1, 2, 3, 4, 5])) return 'Weekdays';
    if (sameDays(days, [6, 7])) return 'Weekends';
    if (days.length === 7) return 'Every day';
    return days.map((d) => WEEKDAYS[d - 1].short).join(', ');
  }
  const base = `${habit.targetPerWeek}× per week`;
  return weekProgress ? `${base} · ${weekProgress.done}/${weekProgress.target} this week` : base;
}

/** "🔥 7 days" / "🔥 3 weeks" / "1 day", or null when there is no current streak. */
export function streakLabel(streak) {
  if (!streak || streak.current <= 0) return null;
  const unit = streak.unit === 'weeks' ? 'week' : 'day';
  return `${streak.current} ${unit}${streak.current === 1 ? '' : 's'}`;
}
