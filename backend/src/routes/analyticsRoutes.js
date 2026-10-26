/**
 * Analytics routes, mounted at /api/v1/analytics. Read-only (GET), workspace-scoped:
 * requireAuth -> resolveWorkspace -> validate -> controller.
 * The per-habit calendar, GET /habits/:id/history, lives in habitRoutes.js.
 */
import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { heatmapQuery, summaryQuery } from '../validators/analyticsValidators.js';

export const analyticsRouter = Router();

// csrfProtection only checks unsafe methods, so it is a no-op for these GETs today. It is in
// the chain anyway so a POST added here later is protected (tests/integration/routeGuards.test.js).
analyticsRouter.use(requireAuth, csrfProtection, resolveWorkspace);

analyticsRouter.get('/summary', validate({ query: summaryQuery }), analyticsController.summary);
analyticsRouter.get('/heatmap', validate({ query: heatmapQuery }), analyticsController.heatmap);
