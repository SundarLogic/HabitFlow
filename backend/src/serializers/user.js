/**
 * The ONE place that decides what a user looks like in API responses.
 *
 * It copies an explicit allow-list of fields, so a column added to `users` later (or a
 * passwordHash that happens to be loaded) can never leak by accident. Controllers must always
 * respond with toPublicUser(user), never with the model instance itself.
 */

/**
 * @param {import('../models/User.js').User} user
 * @returns {{ id: string, name: string, email: string, timezone: string,
 *   notificationPreferences: object, lastLoginAt: Date | null, createdAt: Date, updatedAt: Date }}
 */
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    notificationPreferences: user.notificationPreferences,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
