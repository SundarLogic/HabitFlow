/**
 * API shape of a habit completion (camelCase, CLAUDE.md §5).
 */

/**
 * @param {import('../models/HabitCompletion.js').HabitCompletion} completion
 * @returns {{ id: string, habitId: string, completedBy: string, completionDate: string,
 *   completedAt: Date, note: string | null }}
 */
export function toPublicCompletion(completion) {
  return {
    id: completion.id,
    habitId: completion.habitId,
    completedBy: completion.completedBy,
    completionDate: completion.completionDate,
    completedAt: completion.completedAt,
    note: completion.note,
  };
}
