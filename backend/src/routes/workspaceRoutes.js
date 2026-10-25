/**
 * Workspace routes, mounted at /api/v1/workspaces.
 * GET / lists the workspaces the user belongs to. It needs no active workspace, so it skips
 * resolveWorkspace.
 */
import { Router } from 'express';
import * as workspaceController from '../controllers/workspaceController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../validators/common.js';

export const workspaceRouter = Router();

workspaceRouter.get(
  '/',
  requireAuth,
  validate({ query: paginationQuery }),
  workspaceController.list,
);
