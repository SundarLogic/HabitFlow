/**
 * Habit routes, mounted at /api/v1/habits.
 *
 * Every route: requireAuth -> csrfProtection (unsafe methods) -> resolveWorkspace, then
 * validate -> controller. Any member of the active workspace may manage its habits (team roles
 * arrive with team features). Completions are nested here: /habits/:id/completions/:date.
 *
 * ORDER MATTERS: Express matches routes top to bottom, so the fixed paths /categories and
 * /reorder must come before /:id, or "reorder" would be treated as a habit id.
 */
import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController.js';
import * as completionController from '../controllers/completionController.js';
import * as habitController from '../controllers/habitController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { habitHistoryQuery } from '../validators/analyticsValidators.js';
import { completionParams, markCompletionBody } from '../validators/completionValidators.js';
import {
  createHabitBody,
  deleteHabitQuery,
  habitIdParams,
  listHabitsQuery,
  reorderHabitsBody,
  updateHabitBody,
} from '../validators/habitValidators.js';

export const habitRouter = Router();

habitRouter.use(requireAuth, csrfProtection, resolveWorkspace);

habitRouter.get('/', validate({ query: listHabitsQuery }), habitController.list);
habitRouter.post('/', validate({ body: createHabitBody }), habitController.create);
habitRouter.get('/categories', habitController.categories);
habitRouter.patch('/reorder', validate({ body: reorderHabitsBody }), habitController.reorder);

habitRouter.get('/:id', validate({ params: habitIdParams }), habitController.get);
habitRouter.patch(
  '/:id',
  validate({ params: habitIdParams, body: updateHabitBody }),
  habitController.update,
);
habitRouter.delete(
  '/:id',
  validate({ params: habitIdParams, query: deleteHabitQuery }),
  habitController.remove,
);
// Per-day statuses for the habit detail calendar (default: the last 30 days).
habitRouter.get(
  '/:id/history',
  validate({ params: habitIdParams, query: habitHistoryQuery }),
  analyticsController.habitHistory,
);
habitRouter.post('/:id/archive', validate({ params: habitIdParams }), habitController.archive);
habitRouter.post('/:id/unarchive', validate({ params: habitIdParams }), habitController.unarchive);

// Completions: PUT marks a date done (idempotent: 201 new / 200 existing), DELETE undoes it (204).
habitRouter.put(
  '/:id/completions/:date',
  validate({ params: completionParams, body: markCompletionBody }),
  completionController.mark,
);
habitRouter.delete(
  '/:id/completions/:date',
  validate({ params: completionParams }),
  completionController.unmark,
);
