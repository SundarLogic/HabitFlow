/**
 * API shape of an in-app notification (camelCase, CLAUDE.md §5).
 */

/**
 * The dedupe key stays internal; clients see everything else.
 * @param {import('../models/Notification.js').Notification} notification
 */
export function toPublicNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}
