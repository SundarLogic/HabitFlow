/**
 * API shape of a habit (camelCase, CLAUDE.md §5). Used by every /habits response.
 * Expects the habit to be loaded with its `scheduleDays` (habitService always does this).
 */

/**
 * @param {import('../models/Habit.js').Habit} habit
 * @returns {object} weekdays = sorted ISO weekdays for `weekdays` habits, null for other types
 */
export function toPublicHabit(habit) {
  return {
    id: habit.id,
    workspaceId: habit.workspaceId,
    createdBy: habit.createdBy,
    name: habit.name,
    description: habit.description,
    category: habit.category,
    color: habit.color,
    icon: habit.icon,
    frequencyType: habit.frequencyType,
    weekdays:
      habit.frequencyType === 'weekdays'
        ? (habit.scheduleDays ?? []).map((day) => day.weekday).sort((a, b) => a - b)
        : null,
    targetPerWeek: habit.targetPerWeek,
    startDate: habit.startDate,
    status: habit.status,
    archivedAt: habit.archivedAt,
    sortOrder: habit.sortOrder,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
  };
}
