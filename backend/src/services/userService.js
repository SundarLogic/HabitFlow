/**
 * User service: the logged-in user's own account (profile, password, deletion) and the
 * GET /auth/me overview.
 *
 * Request flow: userRoutes / authRoutes -> validators -> userController / authController
 * -> THIS FILE -> models. The caller is always the authenticated user (req.user).
 */
import { sequelize, User, Workspace } from '../models/index.js';
import { ValidationError } from '../utils/AppError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { logoutAll } from './authService.js';
import { getWorkspacePlan, listWorkspaces } from './workspaceService.js';

/**
 * Loads the user WITH their password hash and checks `password` against it.
 * Wrong password -> 422 INVALID_CURRENT_PASSWORD (not 401: the session itself is fine, and a
 * 401 would make the SPA think the user was logged out).
 */
async function assertPassword(userId, password) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ValidationError('Current password is incorrect', {
      code: 'INVALID_CURRENT_PASSWORD',
    });
  }
  return user;
}

/**
 * Everything the SPA needs after a page load.
 * @param {{ user: User, workspace: Workspace, role: string }} context the authenticated user and
 *   the active workspace resolved by the resolveWorkspace middleware
 * @returns {Promise<{ user: User, memberships: object[], activeWorkspaceId: string,
 *   plan: { code: string, limits: object } }>}
 */
export async function getMe({ user, workspace }) {
  const [{ memberships }, plan] = await Promise.all([
    listWorkspaces({ userId: user.id }),
    getWorkspacePlan(workspace.id),
  ]);
  return {
    user,
    memberships,
    activeWorkspaceId: workspace.id,
    plan: { code: plan.code, limits: plan.limits },
  };
}

/**
 * Updates name, timezone and/or notification preferences. Preferences are MERGED, so sending
 * `{ reminders: false }` leaves `inApp` unchanged.
 * @param {User} user the authenticated user instance
 * @param {{ name?: string, timezone?: string, notificationPreferences?: object }} changes
 * @returns {Promise<User>}
 */
export function updateProfile(user, changes) {
  const updates = {};
  if (changes.name !== undefined) updates.name = changes.name;
  if (changes.timezone !== undefined) updates.timezone = changes.timezone;
  if (changes.notificationPreferences !== undefined) {
    updates.notificationPreferences = {
      ...user.notificationPreferences,
      ...changes.notificationPreferences,
    };
  }
  return user.update(updates);
}

/**
 * Changes the password and logs out every OTHER session (a stolen session dies with the old
 * password), keeping the one that made the change. Both happen in one transaction.
 * @param {{ userId: string, sessionId: string, currentPassword: string, newPassword: string }} params
 * @returns {Promise<number>} how many other sessions were revoked
 */
export async function changePassword({ userId, sessionId, currentPassword, newPassword }) {
  const user = await assertPassword(userId, currentPassword);
  const passwordHash = await hashPassword(newPassword);
  return sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash }, { transaction });
    return logoutAll(userId, { exceptSessionId: sessionId, transaction });
  });
}

/**
 * Permanently deletes the account after re-checking the password. In one transaction:
 *   1. delete the user's personal workspace -> cascades to its members, subscription, habits,
 *      schedule days, completions and reminders;
 *   2. delete the user -> cascades to sessions, memberships, reminders and notifications.
 * If the user still owns a team workspace or has history in someone else's workspace, the
 * RESTRICT foreign keys stop step 2 and the error handler answers 409 RESOURCE_IN_USE.
 * @param {{ userId: string, password: string }} params
 */
export async function deleteAccount({ userId, password }) {
  await assertPassword(userId, password);
  await sequelize.transaction(async (transaction) => {
    await Workspace.destroy({
      where: { ownerUserId: userId, workspaceType: 'personal' },
      transaction,
    });
    await User.destroy({ where: { id: userId }, transaction });
  });
}
