/**
 * Notification inbox: list, count and mark the logged-in user's in-app notifications, and the
 * 90-day purge run by the housekeeping job. Sending is done elsewhere (services/notifications/).
 *
 * Notifications belong to a USER, not a workspace, so these endpoints skip resolveWorkspace.
 * Another user's notification is a 404.
 */
import { Op } from 'sequelize';
import { Notification } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';
import { now as systemNow } from '../utils/clock.js';

/** CLAUDE.md §3.1: notifications older than this are purged. */
export const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * How many unread notifications the user has (for the bell badge).
 * @param {string} userId
 * @returns {Promise<number>}
 */
export function countUnread(userId) {
  return Notification.count({ where: { userId, readAt: null } });
}

/**
 * The user's notifications, newest first.
 * @param {{ userId: string, unreadOnly?: boolean, page: number, limit: number }} params
 * @returns {Promise<{ notifications: Notification[], total: number, unreadCount: number }>}
 */
export async function listNotifications({ userId, unreadOnly = false, page, limit }) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [{ rows, count }, unreadCount] = await Promise.all([
    Notification.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
      limit,
      offset: (page - 1) * limit,
    }),
    countUnread(userId),
  ]);
  return { notifications: rows, total: count, unreadCount };
}

/**
 * Marks one notification read. Idempotent: an already-read notification keeps its first readAt.
 * @param {{ userId: string, id: string, now?: () => Date }} params
 * @returns {Promise<Notification>}
 */
export async function markRead({ userId, id, now = systemNow }) {
  const notification = await Notification.findOne({ where: { id, userId } });
  if (!notification) throw new NotFoundError('Notification not found');
  if (!notification.readAt) await notification.update({ readAt: now() });
  return notification;
}

/**
 * Marks all of the user's unread notifications read.
 * @param {{ userId: string, now?: () => Date }} params
 * @returns {Promise<number>} how many were marked
 */
export async function markAllRead({ userId, now = systemNow }) {
  const [updated] = await Notification.update(
    { readAt: now() },
    { where: { userId, readAt: null } },
  );
  return updated;
}

/**
 * Deletes notifications older than 90 days, read or not (CLAUDE.md §3.1). Run daily by the
 * housekeeping job; an old reminder nobody opened has no value any more.
 * @param {{ now?: () => Date }} [options]
 * @returns {Promise<number>} how many were deleted
 */
export function purgeOldNotifications({ now = systemNow } = {}) {
  const cutoff = new Date(now().getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return Notification.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
}
