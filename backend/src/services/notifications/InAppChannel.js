/**
 * InAppChannel: delivers a notification by writing a row to the `notifications` table, which the
 * SPA reads through GET /notifications.
 *
 * De-duplication is done by the database: dedupe_key is UNIQUE, and the insert uses
 * ON CONFLICT DO NOTHING. So two scheduler instances, a restart, or a retried tick can all try to
 * send `reminder:<id>:<date>` and exactly one row exists afterwards. (NULL keys never conflict:
 * notifications without a key are always inserted.)
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../models/index.js';
import { NotificationChannel } from './NotificationChannel.js';

export class InAppChannel extends NotificationChannel {
  name = 'in_app';

  /** On unless the user switched in-app notifications off. */
  isEnabled(preferences) {
    return preferences?.inApp !== false;
  }

  /**
   * @param {import('./NotificationChannel.js').OutgoingNotification} notification
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<{ delivered: boolean, id?: string }>}
   */
  async send(notification, { transaction } = {}) {
    const rows = await sequelize.query(
      `INSERT INTO notifications (id, user_id, type, title, message, data, dedupe_key, created_at)
       VALUES (gen_random_uuid(), :userId, :type, :title, :message, CAST(:data AS jsonb), :dedupeKey, now())
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      {
        replacements: {
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: JSON.stringify(notification.data ?? {}),
          dedupeKey: notification.dedupeKey ?? null,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    return rows.length === 1 ? { delivered: true, id: rows[0].id } : { delivered: false };
  }
}
