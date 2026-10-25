/**
 * Reminder routes, mounted at /api/v1/reminders (edit and delete one reminder).
 * Listing and creating live under /habits/:id/reminders (habitRoutes.js).
 * requireAuth -> csrfProtection -> resolveWorkspace -> validate -> controller.
 */
import { Router } from 'express';
import * as reminderController from '../controllers/reminderController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { reminderIdParams, updateReminderBody } from '../validators/reminderValidators.js';

export const reminderRouter = Router();

reminderRouter.use(requireAuth, csrfProtection, resolveWorkspace);

reminderRouter.patch(
  '/:id',
  validate({ params: reminderIdParams, body: updateReminderBody }),
  reminderController.update,
);
reminderRouter.delete('/:id', validate({ params: reminderIdParams }), reminderController.remove);
