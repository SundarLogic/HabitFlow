/**
 * Analytics routes, mounted at /api/v1/analytics. Read-only (GET), workspace-scoped:
 * requireAuth -> resolveWorkspace -> validate -> controller.
 * The per-habit calendar, GET /habits/:id/history, lives in habitRoutes.js.
 */
import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { heatmapQuery, summaryQuery } from '../validators/analyticsValidators.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, resolveWorkspace);

analyticsRouter.get('/summary', validate({ query: summaryQuery }), analyticsController.summary);
analyticsRouter.get('/heatmap', validate({ query: heatmapQuery }), analyticsController.heatmap);
