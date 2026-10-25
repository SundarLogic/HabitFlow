/**
 * Request schemas for /api/v1/notifications, applied by validate() in routes/notificationRoutes.js.
 */
import { z } from 'zod';
import { paginationQuery } from './common.js';

/** GET /notifications?unreadOnly=true|false&page&limit */
export const listNotificationsQuery = paginationQuery.extend({
  // Query values are strings; map "true"/"false" explicitly (z.coerce.boolean("false") is true).
  unreadOnly: z
    .enum(['true', 'false'], { message: 'must be "true" or "false"' })
    .default('false')
    .transform((value) => value === 'true'),
});

/** :id in /notifications/:id/read */
export const notificationIdParams = z.object({ id: z.uuid({ message: 'must be a UUID' }) });
