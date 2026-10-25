/**
 * Notification inbox routes, mounted at /api/v1/notifications.
 * requireAuth -> csrfProtection (unsafe methods) -> validate -> controller. No resolveWorkspace:
 * notifications belong to the user, whichever workspace they come from.
 * The fixed path /unread-count is declared before /:id routes.
 */
import { Router } from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import {
  listNotificationsQuery,
  notificationIdParams,
} from '../validators/notificationValidators.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth, csrfProtection);

notificationRouter.get(
  '/',
  validate({ query: listNotificationsQuery }),
  notificationController.list,
);
notificationRouter.get('/unread-count', notificationController.unreadCount);
notificationRouter.post('/read-all', notificationController.markAllRead);
notificationRouter.patch(
  '/:id/read',
  validate({ params: notificationIdParams }),
  notificationController.markRead,
);
