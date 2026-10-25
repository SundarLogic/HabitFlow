/**
 * Notification delivery (services/notifications/) and the daily housekeeping job.
 *
 *   - dispatchNotification honours preferences and de-duplicates by dedupe_key;
 *   - extension point: an extra channel (a fake "push" channel here) receives notifications
 *     without any change to the dispatcher, the way PushChannel / EmailChannel will later;
 *   - runHousekeeping deletes expired sessions and notifications older than 90 days.
 */
import { createLogger } from '../../src/config/logger.js';
import { runHousekeeping } from '../../src/jobs/housekeeping.js';
import { Notification, Session, sequelize } from '../../src/models/index.js';
import { InAppChannel } from '../../src/services/notifications/InAppChannel.js';
import { NotificationChannel } from '../../src/services/notifications/NotificationChannel.js';
import { dispatchNotification } from '../../src/services/notifications/index.js';
import { hashToken } from '../../src/utils/tokens.js';
import { truncateAllTables } from '../helpers/db.js';
import { createUser } from '../helpers/factories.js';

/** A stand-in for a future push channel: records what it was asked to send. */
class FakePushChannel extends NotificationChannel {
  name = 'push';
  sent = [];
  isEnabled(preferences) {
    return preferences.push === true;
  }
  send(notification) {
    this.sent.push(notification);
    return Promise.resolve({ delivered: true });
  }
}

const base = { type: 'system', title: 'Hello', message: 'Welcome' };
let user;
beforeEach(async () => {
  await truncateAllTables();
  user = await createUser();
});

describe('dispatchNotification', () => {
  it('writes an in-app notification and de-duplicates by key', async () => {
    const first = await dispatchNotification({ user, ...base, dedupeKey: 'welcome:1' });
    const second = await dispatchNotification({ user, ...base, dedupeKey: 'welcome:1' });
    expect(first).toEqual([{ channel: 'in_app', delivered: true, id: expect.any(String) }]);
    expect(second).toEqual([{ channel: 'in_app', delivered: false }]);
    expect(await Notification.count()).toBe(1);
  });

  it('notifications without a key are never de-duplicated', async () => {
    await dispatchNotification({ user, ...base });
    await dispatchNotification({ user, ...base });
    expect(await Notification.count()).toBe(2);
  });

  it('reminders: false mutes reminder notifications only', async () => {
    const muted = { ...user.toJSON(), notificationPreferences: { inApp: true, reminders: false } };
    expect(await dispatchNotification({ user: muted, ...base, type: 'habit_reminder' })).toEqual(
      [],
    );
    await dispatchNotification({ user: muted, ...base, type: 'streak_milestone' });
    expect(await Notification.count()).toBe(1);
  });

  it('extension point: an added channel receives the notification', async () => {
    const push = new FakePushChannel();
    const channels = [new InAppChannel(), push];
    const prefs = { inApp: false, reminders: true, push: true };

    const results = await dispatchNotification({
      user: { id: user.id, notificationPreferences: prefs },
      ...base,
      data: { habitId: 'h1' },
      channels,
    });
    expect(results).toEqual([{ channel: 'push', delivered: true }]); // in-app switched off
    expect(push.sent).toEqual([
      expect.objectContaining({ userId: user.id, title: 'Hello', data: { habitId: 'h1' } }),
    ]);
    expect(await Notification.count()).toBe(0);
  });

  it('the base class refuses to send (subclasses must implement it)', async () => {
    await expect(new NotificationChannel().send({}, {})).rejects.toThrow(/not implemented/);
  });
});

describe('runHousekeeping', () => {
  const NOW = new Date('2026-10-28T03:15:00Z');
  const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

  it('deletes expired sessions and notifications older than 90 days, keeps the rest', async () => {
    await Session.create({ userId: user.id, tokenHash: hashToken('old'), expiresAt: daysAgo(1) });
    await Session.create({ userId: user.id, tokenHash: hashToken('live'), expiresAt: daysAgo(-5) });

    for (const [title, age] of [
      ['ancient unread', 120],
      ['ancient read', 91],
      ['recent', 89],
    ]) {
      const n = await Notification.create({ userId: user.id, ...base, title });
      // created_at is set by the DB; move it back in time directly.
      await sequelize.query('UPDATE notifications SET created_at = :at WHERE id = :id', {
        replacements: { at: daysAgo(age), id: n.id },
      });
    }

    const result = await runHousekeeping({
      now: () => NOW,
      logger: createLogger({ level: 'silent' }),
    });
    expect(result).toEqual({ sessions: 1, notifications: 2 });
    expect((await Notification.findAll()).map((n) => n.title)).toEqual(['recent']);
    expect(await Session.count()).toBe(1);
  });
});
