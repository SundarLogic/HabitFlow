/**
 * Entitlement service: what a workspace's plan allows (CLAUDE.md §3.1 "Plans / entitlements").
 *
 * Limits are read from plans.limits (via workspace_subscriptions, falling back to `free`),
 * never hard-coded. habitService calls this before creating or restoring an active habit.
 */
import { Habit, Workspace } from '../models/index.js';
import { ForbiddenError } from '../utils/AppError.js';
import { getWorkspacePlan } from './workspaceService.js';

/**
 * Throws if the workspace may not have one more ACTIVE habit. Call it inside the transaction
 * that creates (or un-archives) the habit.
 *
 * Race safety: two requests could both count 9 habits and both insert a 10th + 11th. To prevent
 * that, the workspace row is locked (SELECT ... FOR UPDATE) first, so a second request for the
 * SAME workspace waits here until the first transaction commits, then counts again.
 *
 * @param {{ id: string }} workspace
 * @param {{ transaction: import('sequelize').Transaction }} options required: the lock only lasts
 *   as long as the transaction
 * @throws {ForbiddenError} 403 PLAN_LIMIT_REACHED with details { limit, current }
 */
export async function assertCanCreateActiveHabit(workspace, { transaction }) {
  if (!transaction) throw new Error('assertCanCreateActiveHabit must run inside a transaction');

  const plan = await getWorkspacePlan(workspace.id);
  const limit = plan.limits?.maxActiveHabits;
  // null / missing = unlimited (e.g. the pro plan).
  if (limit === null || limit === undefined) return;

  await Workspace.findByPk(workspace.id, { transaction, lock: transaction.LOCK.UPDATE });
  const current = await Habit.count({
    where: { workspaceId: workspace.id, status: 'active' },
    transaction,
  });
  if (current >= limit) {
    throw new ForbiddenError(`Your plan allows up to ${limit} active habits`, {
      code: 'PLAN_LIMIT_REACHED',
      details: { limit, current },
    });
  }
}
