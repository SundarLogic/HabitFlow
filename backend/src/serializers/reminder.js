/**
 * API shape of a habit reminder (camelCase, CLAUDE.md §5).
 */

/**
 * @param {import('../models/HabitReminder.js').HabitReminder} reminder
 * @returns {{ id: string, habitId: string, remindAt: string, weekdays: number[] | null,
 *   enabled: boolean, createdAt: Date, updatedAt: Date }} remindAt as 'HH:mm'
 */
export function toPublicReminder(reminder) {
  return {
    id: reminder.id,
    habitId: reminder.habitId,
    // Postgres returns TIME as 'HH:mm:ss'; the API speaks 'HH:mm'.
    remindAt: reminder.remindAt.slice(0, 5),
    weekdays: reminder.weekdays ? [...reminder.weekdays].sort((a, b) => a - b) : null,
    enabled: reminder.enabled,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  };
}
