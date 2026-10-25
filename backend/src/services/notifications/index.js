/**
 * Notification dispatch: the single entry point for SENDING a notification.
 *
 *   await dispatchNotification({ user, type: 'habit_reminder', title, message, data, dedupeKey });
 *
 * It reads the user's notification_preferences and hands the notification to every enabled
 * channel. Callers (the reminder scheduler, streak milestones) never talk to a channel directly,
 * so adding push or email later only means registering a channel here (see NotificationChannel.js).
 *
 * Preferences (users.notification_preferences):
 *   reminders: false  -> no habit_reminder notifications on any channel
 *   inApp: false      -> nothing is written to the in-app inbox
 */
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../models/constants.js';
import { InAppChannel } from './InAppChannel.js';

/** Channels used in production. Future: new PushChannel(), new EmailChannel(). */
export const DEFAULT_CHANNELS = Object.freeze([new InAppChannel()]);

/**
 * Sends one notification through every channel the user has enabled.
 *
 * @param {object} params
 * @param {{ id: string, notificationPreferences?: object }} params.user recipient
 * @param {'habit_reminder' | 'streak_milestone' | 'system'} params.type
 * @param {string} params.title
 * @param {string} params.message
 * @param {object} [params.data]
 * @param {string} [params.dedupeKey] never delivered twice (see InAppChannel)
 * @param {import('sequelize').Transaction} [params.transaction]
 * @param {import('./NotificationChannel.js').NotificationChannel[]} [params.channels] tests inject
 *   fakes here
 * @returns {Promise<{ channel: string, delivered: boolean, id?: string }[]>} one entry per channel
 *   that was tried; empty when the user's preferences ruled it out
 */
export async function dispatchNotification({
  user,
  type,
  title,
  message,
  data = {},
  dedupeKey = null,
  transaction,
  channels = DEFAULT_CHANNELS,
}) {
  const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...user.notificationPreferences };
  if (type === 'habit_reminder' && preferences.reminders === false) return [];

  const notification = { userId: user.id, type, title, message, data, dedupeKey };
  const results = [];
  for (const channel of channels) {
    if (!channel.isEnabled(preferences)) continue;
    const result = await channel.send(notification, { transaction });
    results.push({ channel: channel.name, ...result });
  }
  return results;
}
