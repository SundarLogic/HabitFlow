/**
 * NotificationChannel: the contract every delivery channel implements (PRD 4.6).
 *
 * First release has ONE channel, InAppChannel (rows in the `notifications` table). Push and email
 * delivery come later; they plug in as new subclasses registered in ./index.js, with no change to
 * the code that creates notifications (reminder scheduler, streak milestones).
 *
 * How to add a channel later (e.g. PushChannel):
 *   1. class PushChannel extends NotificationChannel {
 *        name = 'push';
 *        isEnabled(preferences) { return preferences.push === true; }
 *        async send(notification, { transaction }) { ...call the push provider... }
 *      }
 *   2. Add a preference flag (users.notification_preferences.push) and its validator.
 *   3. Register it in DEFAULT_CHANNELS in ./index.js.
 *   4. De-duplication: InAppChannel relies on notifications.dedupe_key. An external channel must
 *      keep its own delivery log keyed by dedupeKey (or be registered after InAppChannel and
 *      skip sending when that channel reported `delivered: false`).
 */

/**
 * @typedef {object} OutgoingNotification
 * @property {string} userId recipient
 * @property {'habit_reminder' | 'streak_milestone' | 'system'} type
 * @property {string} title short headline (<= 120 chars)
 * @property {string} message body text (<= 500 chars)
 * @property {object} data machine-readable context, e.g. { habitId, date }
 * @property {string | null} dedupeKey the same key is never delivered twice
 */

/** Base class; subclasses override `name`, `isEnabled` and `send`. */
export class NotificationChannel {
  /** Short identifier used in logs and results, e.g. 'in_app'. */
  name = 'abstract';

  /**
   * Whether the user wants notifications on this channel.
   * @param {{ inApp?: boolean, reminders?: boolean }} _preferences users.notification_preferences
   * @returns {boolean}
   */
  isEnabled(_preferences) {
    return false;
  }

  /**
   * Delivers one notification.
   * @param {OutgoingNotification} _notification
   * @param {{ transaction?: import('sequelize').Transaction }} _options
   * @returns {Promise<{ delivered: boolean, id?: string }>} delivered = false when de-duplicated
   */
  send(_notification, _options) {
    return Promise.reject(new Error(`${this.constructor.name}.send() is not implemented`));
  }
}
