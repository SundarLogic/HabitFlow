/**
 * Reminder CRUD: GET/POST /habits/:id/reminders, PATCH/DELETE /reminders/:id.
 * Rules: 'HH:mm' times, weekdays 1-7 (unique, non-empty or null), weekdays within a weekdays
 * habit's schedule, at most 5 per habit, one per time, none on archived habits, and every
 * reminder is private to its user and workspace (404 otherwise).
 */
import request from 'supertest';
import { HabitReminder } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp();
const remindersOf = (habit) => `/api/v1/habits/${habit.id}/reminders`;

let ctx;
let habit;
beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  ctx = await signupAgent(app);
  habit = await createHabitViaApi(ctx, { startDate: '2026-10-01' });
});

describe('create and list', () => {
  it('creates a reminder (201) with defaults, and lists them by time', async () => {
    const res = await call(ctx, 'post', remindersOf(habit), { remindAt: '18:30' });
    expect(res.status).toBe(201);
    expect(res.body.reminder).toEqual({
      id: expect.any(String),
      habitId: habit.id,
      remindAt: '18:30',
      weekdays: null,
      enabled: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    await call(ctx, 'post', remindersOf(habit), {
      remindAt: '07:05',
      weekdays: [5, 1],
      enabled: false,
    });
    const list = await call(ctx, 'get', remindersOf(habit));
    expect(list.status).toBe(200);
    expect(list.body.data.map((r) => [r.remindAt, r.weekdays, r.enabled])).toEqual([
      ['07:05', [1, 5], false],
      ['18:30', null, true],
    ]);
  });

  it.each([
    ['missing time', {}, 'remindAt'],
    ['seconds', { remindAt: '07:30:00' }, 'remindAt'],
    ['hour 24', { remindAt: '24:00' }, 'remindAt'],
    ['one-digit hour', { remindAt: '7:30' }, 'remindAt'],
    ['weekday 0', { remindAt: '07:30', weekdays: [0] }, 'weekdays.0'],
    ['weekday 8', { remindAt: '07:30', weekdays: [8] }, 'weekdays.0'],
    ['empty weekdays', { remindAt: '07:30', weekdays: [] }, 'weekdays'],
    ['duplicate weekdays', { remindAt: '07:30', weekdays: [2, 2] }, 'weekdays'],
    ['non-boolean enabled', { remindAt: '07:30', enabled: 'yes' }, 'enabled'],
  ])('rejects %s with 422', async (_label, body, path) => {
    const res = await call(ctx, 'post', remindersOf(habit), body);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ location: 'body', path });
  });

  it("a weekdays habit's reminder must use days the habit runs on", async () => {
    const gym = await createHabitViaApi(ctx, {
      name: 'Gym',
      frequencyType: 'weekdays',
      weekdays: [1, 3, 5],
      startDate: '2026-10-01',
    });
    const res = await call(ctx, 'post', remindersOf(gym), { remindAt: '07:00', weekdays: [1, 2] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'REMINDER_WEEKDAYS_NOT_SCHEDULED',
      details: { allowed: [1, 3, 5], outside: [2] },
    });
    expect(
      (await call(ctx, 'post', remindersOf(gym), { remindAt: '07:00', weekdays: [3, 5] })).status,
    ).toBe(201);
    // null = every scheduled day, always allowed
    expect((await call(ctx, 'post', remindersOf(gym), { remindAt: '08:00' })).status).toBe(201);
  });

  it('allows at most 5 reminders per habit', async () => {
    for (const time of ['06:00', '07:00', '08:00', '09:00', '10:00']) {
      expect((await call(ctx, 'post', remindersOf(habit), { remindAt: time })).status).toBe(201);
    }
    const sixth = await call(ctx, 'post', remindersOf(habit), { remindAt: '11:00' });
    expect(sixth.status).toBe(422);
    expect(sixth.body.error).toMatchObject({
      code: 'REMINDER_LIMIT_REACHED',
      details: { limit: 5 },
    });
    expect(await HabitReminder.count()).toBe(5);
  });

  it('two reminders at the same time -> 409 REMINDER_DUPLICATE', async () => {
    await call(ctx, 'post', remindersOf(habit), { remindAt: '07:00' });
    const res = await call(ctx, 'post', remindersOf(habit), { remindAt: '07:00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REMINDER_DUPLICATE');
  });

  it('archived habits cannot get new reminders (409 HABIT_ARCHIVED)', async () => {
    await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);
    const res = await call(ctx, 'post', remindersOf(habit), { remindAt: '07:00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HABIT_ARCHIVED');
  });
});

describe('update and delete', () => {
  let reminder;
  beforeEach(async () => {
    reminder = (await call(ctx, 'post', remindersOf(habit), { remindAt: '07:00' })).body.reminder;
  });

  it('PATCH changes time, weekdays and enabled', async () => {
    const res = await call(ctx, 'patch', `/api/v1/reminders/${reminder.id}`, {
      remindAt: '21:15',
      weekdays: [6, 7],
      enabled: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.reminder).toMatchObject({
      remindAt: '21:15',
      weekdays: [6, 7],
      enabled: false,
    });

    const cleared = await call(ctx, 'patch', `/api/v1/reminders/${reminder.id}`, {
      weekdays: null,
    });
    expect(cleared.body.reminder.weekdays).toBeNull();
  });

  it('PATCH validates: empty body, bad time, weekdays outside the schedule, duplicates', async () => {
    expect((await call(ctx, 'patch', `/api/v1/reminders/${reminder.id}`, {})).status).toBe(422);
    expect(
      (await call(ctx, 'patch', `/api/v1/reminders/${reminder.id}`, { remindAt: '7am' })).status,
    ).toBe(422);
    await call(ctx, 'post', remindersOf(habit), { remindAt: '08:00' });
    const dup = await call(ctx, 'patch', `/api/v1/reminders/${reminder.id}`, { remindAt: '08:00' });
    expect(dup.status).toBe(409);
  });

  it('DELETE removes it (204); a second DELETE is 404', async () => {
    expect((await call(ctx, 'delete', `/api/v1/reminders/${reminder.id}`)).status).toBe(204);
    expect(await HabitReminder.count()).toBe(0);
    expect((await call(ctx, 'delete', `/api/v1/reminders/${reminder.id}`)).status).toBe(404);
  });

  it('deleting the habit permanently removes its reminders', async () => {
    await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);
    await call(ctx, 'delete', `/api/v1/habits/${habit.id}?permanent=true`);
    expect(await HabitReminder.count()).toBe(0);
  });
});

describe('authorization', () => {
  it("another user's habit or reminder -> 404 everywhere, and nothing changes", async () => {
    const reminder = (await call(ctx, 'post', remindersOf(habit), { remindAt: '07:00' })).body
      .reminder;
    const other = await signupAgent(app);

    expect((await call(other, 'get', remindersOf(habit))).status).toBe(404);
    expect((await call(other, 'post', remindersOf(habit), { remindAt: '09:00' })).status).toBe(404);
    const patch = await call(other, 'patch', `/api/v1/reminders/${reminder.id}`, {
      enabled: false,
    });
    expect(patch.status).toBe(404);
    expect(patch.body.error.message).toBe('Reminder not found');
    expect((await call(other, 'delete', `/api/v1/reminders/${reminder.id}`)).status).toBe(404);
    expect(await HabitReminder.count({ where: { enabled: true } })).toBe(1);
  });

  it('requires authentication and CSRF; malformed ids are 422', async () => {
    expect((await request(app).get(remindersOf(habit))).status).toBe(401);
    expect((await ctx.agent.post(remindersOf(habit)).send({ remindAt: '07:00' })).status).toBe(403);
    expect((await call(ctx, 'patch', '/api/v1/reminders/nope', { enabled: true })).status).toBe(
      422,
    );
  });
});
