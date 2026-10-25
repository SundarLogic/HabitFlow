/**
 * Notification controller: the HTTP layer for the logged-in user's in-app inbox
 * (/api/v1/notifications). Notifications belong to the user, not to a workspace.
 */
import { toPublicNotification } from '../serializers/notification.js';
import * as notificationService from '../services/notificationService.js';
import { now as systemNow } from '../utils/clock.js';

/** The app clock (tests inject a fixed one via createApp({ now })). */
const clock = (req) => req.app.locals.now ?? systemNow;

/** GET /notifications?unreadOnly&page&limit -> { data, meta: { page, limit, total, unreadCount } } */
export async function list(req, res) {
  const { page, limit, unreadOnly } = req.query;
  const { notifications, total, unreadCount } = await notificationService.listNotifications({
    userId: req.user.id,
    unreadOnly,
    page,
    limit,
  });
  res.set('Cache-Control', 'no-store').json({
    data: notifications.map(toPublicNotification),
    meta: { page, limit, total, unreadCount },
  });
}

/** GET /notifications/unread-count -> { unreadCount } */
export async function unreadCount(req, res) {
  const count = await notificationService.countUnread(req.user.id);
  res.set('Cache-Control', 'no-store').json({ unreadCount: count });
}

/** PATCH /notifications/:id/read -> { notification } (idempotent) */
export async function markRead(req, res) {
  const notification = await notificationService.markRead({
    userId: req.user.id,
    id: req.params.id,
    now: clock(req),
  });
  res.json({ notification: toPublicNotification(notification) });
}

/** POST /notifications/read-all -> { updated } */
export async function markAllRead(req, res) {
  const updated = await notificationService.markAllRead({ userId: req.user.id, now: clock(req) });
  res.json({ updated });
}
