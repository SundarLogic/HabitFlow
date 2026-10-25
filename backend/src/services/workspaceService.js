/**
 * Workspace service: which workspaces a user can use, and which plan applies to one.
 *
 * The resolveWorkspace middleware calls resolveActiveWorkspace() on workspace-scoped requests;
 * GET /workspaces and GET /auth/me use the listing and plan lookups.
 *
 * Security rule (ADR-029): a workspace the user is not a member of is reported as 404, exactly
 * like one that doesn't exist, so IDs can't be probed.
 */
import { Plan, WorkspaceMember, WorkspaceSubscription } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';

/** Subscription statuses that grant the subscribed plan; anything else falls back to free. */
const PLAN_GRANTING_STATUSES = ['active', 'trialing'];

/**
 * Finds the workspace a request should act on, and the user's role in it.
 * @param {{ userId: string, workspaceId?: string | null }} params workspaceId from the
 *   X-Workspace-Id header; omitted = the user's personal workspace
 * @returns {Promise<{ workspace: import('../models/Workspace.js').Workspace, role: string }>}
 * @throws {NotFoundError} 404 when the workspace doesn't exist or the user isn't a member
 */
export async function resolveActiveWorkspace({ userId, workspaceId }) {
  const where = { userId };
  const include = { association: 'workspace', required: true };
  if (workspaceId) {
    where.workspaceId = workspaceId;
  } else {
    include.where = { workspaceType: 'personal', ownerUserId: userId };
  }

  // Starting from the membership row means "not a member" and "doesn't exist" are the same
  // query result (null), so they can't be told apart from outside.
  const membership = await WorkspaceMember.findOne({ where, include: [include] });
  if (!membership) throw new NotFoundError('Workspace not found');
  return { workspace: membership.workspace, role: membership.role };
}

/**
 * Lists the workspaces a user belongs to: personal first, then in the order they were joined.
 * @param {{ userId: string, page?: number, limit?: number }} params
 * @returns {Promise<{ memberships: WorkspaceMember[], total: number }>} each membership has
 *   `.workspace` and `.role`
 */
export async function listWorkspaces({ userId, page = 1, limit = 100 }) {
  const { rows, count } = await WorkspaceMember.findAndCountAll({
    where: { userId },
    include: [{ association: 'workspace', required: true }],
    // 'personal' sorts before 'team' alphabetically.
    order: [
      ['workspace', 'workspaceType', 'ASC'],
      ['joinedAt', 'ASC'],
    ],
    limit,
    offset: (page - 1) * limit,
  });
  return { memberships: rows, total: count };
}

/**
 * The plan that applies to a workspace: its subscribed plan while the subscription is active or
 * trialing, otherwise `free` (CLAUDE.md §3.1).
 * @param {string} workspaceId
 * @returns {Promise<Plan>}
 */
export async function getWorkspacePlan(workspaceId) {
  const subscription = await WorkspaceSubscription.findOne({
    where: { workspaceId, status: PLAN_GRANTING_STATUSES },
    include: [{ association: 'plan', required: true }],
  });
  if (subscription) return subscription.plan;

  const free = await Plan.findOne({ where: { code: 'free' } });
  if (!free) throw new Error('The "free" plan is missing. Run `npm run db:seed`.');
  return free;
}
