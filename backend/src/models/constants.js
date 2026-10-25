/**
 * Allowed values for the enum-like columns, shared by models, and later by Zod validators and
 * services, so there is one list to update in app code.
 *
 * The database enforces the same lists with CHECK constraints (see src/migrations). Migrations
 * keep their own copies on purpose: a migration is a frozen snapshot of history and must not
 * change when this file does. Adding a value therefore means a new migration AND an edit here.
 */

export const WORKSPACE_TYPES = Object.freeze(['personal', 'team']);
export const MEMBER_ROLES = Object.freeze(['owner', 'admin', 'member']);
export const SUBSCRIPTION_STATUSES = Object.freeze(['active', 'trialing', 'past_due', 'canceled']);
export const FREQUENCY_TYPES = Object.freeze(['daily', 'weekdays', 'weekly_target']);
export const HABIT_STATUSES = Object.freeze(['active', 'archived']);
export const NOTIFICATION_TYPES = Object.freeze(['habit_reminder', 'streak_milestone', 'system']);

/** ISO weekday numbers (Luxon `weekday`): 1 = Monday ... 7 = Sunday. */
export const ISO_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({ inApp: true, reminders: true });
