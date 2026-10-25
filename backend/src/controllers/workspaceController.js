/**
 * Workspace controller: the HTTP layer for /api/v1/workspaces.
 */
import { toPublicWorkspace } from '../serializers/workspace.js';
import * as workspaceService from '../services/workspaceService.js';

/** GET /workspaces?page&limit -> { data: [{ id, name, type, role }], meta: { page, limit, total } } */
export async function list(req, res) {
  const { page, limit } = req.query;
  const { memberships, total } = await workspaceService.listWorkspaces({
    userId: req.user.id,
    page,
    limit,
  });
  res.json({
    data: memberships.map((m) => toPublicWorkspace(m.workspace, m.role)),
    meta: { page, limit, total },
  });
}
