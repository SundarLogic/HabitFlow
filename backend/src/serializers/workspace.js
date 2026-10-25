/**
 * API shape of a workspace as seen by one member: the workspace plus that member's role.
 * Used by GET /auth/me and GET /workspaces.
 */

/**
 * @param {import('../models/Workspace.js').Workspace} workspace
 * @param {string} role the requesting user's role in it ('owner' | 'admin' | 'member')
 * @returns {{ id: string, name: string, type: string, role: string }}
 */
export function toPublicWorkspace(workspace, role) {
  return { id: workspace.id, name: workspace.name, type: workspace.workspaceType, role };
}
