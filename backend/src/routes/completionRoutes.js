/**
 * Completion history and daily overview routes:
 *   GET /api/v1/completions?from&to&habitId&page&limit   (completionRouter)
 *   GET /api/v1/today?date                               (todayRouter)
 * Marking and unmarking live under /habits/:id/completions/:date (habitRoutes.js).
 */
import { Router } from 'express';
import * as completionController from '../controllers/completionController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { historyQuery, todayQuery } from '../validators/completionValidators.js';

// csrfProtection is a no-op for GETs; it is listed so every protected route has the same chain.
export const completionRouter = Router();
completionRouter.get(
  '/',
  requireAuth,
  csrfProtection,
  resolveWorkspace,
  validate({ query: historyQuery }),
  completionController.history,
);

export const todayRouter = Router();
todayRouter.get(
  '/',
  requireAuth,
  csrfProtection,
  resolveWorkspace,
  validate({ query: todayQuery }),
  completionController.today,
);
