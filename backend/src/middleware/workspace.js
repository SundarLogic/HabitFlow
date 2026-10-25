/**
 * Workspace authorization middleware. Place after requireAuth:
 *
 *   router.get('/habits', requireAuth, resolveWorkspace, habitController.list);
 *   router.delete('/team/:id', requireAuth, resolveWorkspace, requireRole('owner'), ...);
 *
 * resolveWorkspace reads the X-Workspace-Id header (or defaults to the user's personal
 * workspace), checks membership and sets:
 *   req.workspace        the Workspace every query must filter by
 *   req.membership.role  'owner' | 'admin' | 'member'
 * A malformed id -> 422 VALIDATION_ERROR. Not a member (or no such workspace) -> 404 NOT_FOUND,
 * so outsiders can't tell whether a workspace exists (ADR-029).
 */
import { z } from 'zod';
import { WORKSPACE_HEADER } from '../config/auth.js';
import { resolveActiveWorkspace } from '../services/workspaceService.js';
import { ForbiddenError, ValidationError } from '../utils/AppError.js';

const workspaceIdSchema = z.uuid({ message: 'must be a UUID' });

/** Express middleware; see the file header. */
export async function resolveWorkspace(req, res, next) {
  const header = req.get(WORKSPACE_HEADER);
  let workspaceId = null;
  if (header !== undefined) {
    const parsed = workspaceIdSchema.safeParse(header);
    if (!parsed.success) {
      throw new ValidationError('Request validation failed', {
        details: [
          { location: 'headers', path: WORKSPACE_HEADER.toLowerCase(), message: 'must be a UUID' },
        ],
      });
    }
    workspaceId = parsed.data;
  }

  const { workspace, role } = await resolveActiveWorkspace({ userId: req.user.id, workspaceId });
  req.workspace = workspace;
  req.membership = { role };
  next();
}

/**
 * Allows the request only if the user's role in the active workspace is one of `roles`.
 * The user IS a member here (resolveWorkspace ran first), so 403 reveals nothing new.
 * @param {...('owner' | 'admin' | 'member')} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!roles.includes(req.membership?.role)) {
      throw new ForbiddenError('Your role in this workspace does not allow this action', {
        code: 'INSUFFICIENT_ROLE',
      });
    }
    next();
  };
}
