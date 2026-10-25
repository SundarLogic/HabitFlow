/**
 * In-app notifications: the inbox endpoints (/notifications...), streak milestone notifications
 * created by completions, and the isDue flag on GET /today.
 *
 * Clock: 2026-10-28 13:00 UTC = Wednesday 09:00 in New York (the users' timezone).
 */
import request from 'supertest';
import { Notification } from '../../src/models/index.js';
import { dispatchNotification } from '../../src/services/notifications/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp({ now: () => new Date('2026-10-28T13:00:00Z') });
const signup = () => signupAgent(app, { timezone: 'America/New_York' });

/** Puts a system notification in a user's inbox. */
const notify = (ctx, title, dedupeKey = null) =>
  dispatchNotification({
    user: { id: ctx.user.id },
    type: 'system',
    title,
    message: `${title} message`,
    dedupeKey,
  });

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

describe('inbox endpoints', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await signup();
    for (const title of ['First', 'Second', 'Third']) await notify(ctx, title);
  });

  it('lists my notifications newest first, with unreadCount in meta', async () => {
    const res = await call(ctx, 'get', '/api/v1/notifications?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      type: 'system',
      title: expect.any(String),
      message: expect.any(String),
      data: {},
      readAt: null,
      createdAt: expect.any(String),
    });
    expect(res.body.data[0]).not.toHaveProperty('dedupeKey');
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, unreadCount: 3 });
  });

  it('marks one read (idempotent) and filters with unreadOnly', async () => {
    const [first] = (await call(ctx, 'get', '/api/v1/notifications')).body.data;
    const read = await call(ctx, 'patch', `/api/v1/notifications/${first.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).toBe('2026-10-28T13:00:00.000Z');

    const again = await call(ctx, 'patch', `/api/v1/notifications/${first.id}/read`);
    expect(again.body.notification.readAt).toBe(read.body.notification.readAt);

    const unread = await call(ctx, 'get', '/api/v1/notifications?unreadOnly=true');
    expect(unread.body.meta).toMatchObject({ total: 2, unreadCount: 2 });
    expect(unread.body.data.map((n) => n.id)).not.toContain(first.id);
    expect((await call(ctx, 'get', '/api/v1/notifications/unread-count')).body).toEqual({
      unreadCount: 2,
    });
  });

  it('read-all marks every unread notification', async () => {
    const res = await call(ctx, 'post', '/api/v1/notifications/read-all');
    expect(res.body).toEqual({ updated: 3 });
    expect((await call(ctx, 'get', '/api/v1/notifications/unread-count')).body.unreadCount).toBe(0);
    expect((await call(ctx, 'post', '/api/v1/notifications/read-all')).body).toEqual({
      updated: 0,
    });
  });

  it("another user's notification -> 404, and read-all never touches it", async () => {
    const other = await signup();
    await notify(other, 'Theirs');
    const theirs = await Notification.findOne({ where: { userId: other.user.id } });

    const res = await call(ctx, 'patch', `/api/v1/notifications/${theirs.id}/read`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Notification not found');
    await call(ctx, 'post', '/api/v1/notifications/read-all');
    expect((await theirs.reload()).readAt).toBeNull();
    // And it never appears in my list.
    expect((await call(ctx, 'get', '/api/v1/notifications')).body.meta.total).toBe(3);
  });

  it('validates input and requires authentication / CSRF', async () => {
    expect((await call(ctx, 'get', '/api/v1/notifications?unreadOnly=yes')).status).toBe(422);
    expect((await call(ctx, 'patch', '/api/v1/notifications/nope/read')).status).toBe(422);
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    expect((await ctx.agent.post('/api/v1/notifications/read-all')).status).toBe(403);
  });
});

describe('streak milestones', () => {
  const put = (ctx, habit, date) =>
    call(ctx, 'put', `/api/v1/habits/${habit.id}/completions/${date}`);
  const del = (ctx, habit, date) =>
    call(ctx, 'delete', `/api/v1/habits/${habit.id}/completions/${date}`);
  const milestones = () => Notification.findAll({ where: { type: 'streak_milestone' } });

  it('celebrates the 7th day once, with encouraging copy', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { startDate: '2026-10-01' });
    for (const day of [22, 23, 24, 25, 26, 27]) await put(ctx, habit, `2026-10-${day}`);
    expect(await milestones()).toHaveLength(0); // 6 days: not yet

    await put(ctx, habit, '2026-10-28');
    const [row] = await milestones();
    expect(row).toMatchObject({
      userId: ctx.user.id,
      title: '7-day streak!',
      message:
        'You\'ve completed "Drink water" 7 days in a row. That\'s real consistency. Keep it going!',
      data: { habitId: habit.id, streak: 7, unit: 'days' },
    });

    // Un-marking and re-marking the 7th day doesn't celebrate again.
    await del(ctx, habit, '2026-10-28');
    await put(ctx, habit, '2026-10-28');
    expect(await milestones()).toHaveLength(1);
  });

  it('back-filling a gap that lifts the streak past 7 celebrates it', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { startDate: '2026-10-01' });
    for (const day of [21, 22, 23, 25, 26, 27, 28]) await put(ctx, habit, `2026-10-${day}`);
    expect(await milestones()).toHaveLength(0); // current streak 4 (25-28)

    await put(ctx, habit, '2026-10-24'); // now 21..28 = 8
    expect((await milestones()).map((n) => n.data.streak)).toEqual([7]);
  });

  it('never sends anything when a day is missed or a completion is removed', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { startDate: '2026-10-01' });
    await put(ctx, habit, '2026-10-20');
    await del(ctx, habit, '2026-10-20');
    expect(await Notification.count()).toBe(0);
  });

  it('respects inApp: false', async () => {
    const ctx = await signup();
    await call(ctx, 'patch', '/api/v1/users/me', { notificationPreferences: { inApp: false } });
    const habit = await createHabitViaApi(ctx, { startDate: '2026-10-01' });
    for (const day of [22, 23, 24, 25, 26, 27, 28]) await put(ctx, habit, `2026-10-${day}`);
    expect(await Notification.count()).toBe(0);
  });
});

describe('GET /today isDue', () => {
  const addReminder = (ctx, habit, body) =>
    call(ctx, 'post', `/api/v1/habits/${habit.id}/reminders`, body);
  const item = async (ctx, query = '') =>
    Object.fromEntries(
      (await call(ctx, 'get', `/api/v1/today${query}`)).body.habits.map((h) => [h.habit.name, h]),
    );

  it('is true once a reminder time has passed and the habit is still pending', async () => {
    const ctx = await signup(); // now = 09:00 in New York
    const atNine = await createHabitViaApi(ctx, { name: 'At nine', startDate: '2026-10-01' });
    const atTen = await createHabitViaApi(ctx, { name: 'At ten', startDate: '2026-10-01' });
    const done = await createHabitViaApi(ctx, { name: 'Done', startDate: '2026-10-01' });
    const monOnly = await createHabitViaApi(ctx, { name: 'Mondays', startDate: '2026-10-01' });
    await createHabitViaApi(ctx, { name: 'No reminder', startDate: '2026-10-01' });
    await addReminder(ctx, atNine, { remindAt: '09:00' });
    await addReminder(ctx, atTen, { remindAt: '10:00' });
    await addReminder(ctx, done, { remindAt: '07:00' });
    await addReminder(ctx, monOnly, { remindAt: '07:00', weekdays: [1] });
    await call(ctx, 'put', `/api/v1/habits/${done.id}/completions/2026-10-28`);

    const today = await item(ctx);
    expect(today['At nine'].isDue).toBe(true); // 09:00 <= 09:00
    expect(today['At ten'].isDue).toBe(false); // not yet
    expect(today.Done.isDue).toBe(false); // already completed
    expect(today.Mondays.isDue).toBe(false); // reminder doesn't apply on Wednesdays
    expect(today['No reminder'].isDue).toBe(false);
  });

  it('is always false on other dates', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { name: 'H', startDate: '2026-10-01' });
    await addReminder(ctx, habit, { remindAt: '06:00' });
    expect((await item(ctx, '?date=2026-10-27')).H.isDue).toBe(false);
  });

  it('ignores disabled reminders', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { name: 'H', startDate: '2026-10-01' });
    await addReminder(ctx, habit, { remindAt: '06:00', enabled: false });
    expect((await item(ctx)).H.isDue).toBe(false);
  });
});
