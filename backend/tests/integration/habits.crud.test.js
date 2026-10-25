/**
 * Habit CRUD happy paths and state transitions: create (all three schedules), get, list with
 * filters, categories, update (including frequency changes), archive / unarchive, delete
 * (archive vs permanent) and reorder.
 *
 * The app clock is frozen at 2026-10-25 03:30 UTC. Users sign up in America/New_York, where it
 * is still 2026-10-24: that is "today" for startDate defaults.
 */
import { HabitCompletion, HabitReminder, HabitScheduleDay, Habit } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const NOW = new Date('2026-10-25T03:30:00Z');
const app = createTestApp({ now: () => NOW });
const signup = () => signupAgent(app, { timezone: 'America/New_York' });

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

describe('POST /habits', () => {
  it('creates a daily habit, defaulting startDate to today in the user timezone', async () => {
    const ctx = await signup();
    const res = await call(ctx, 'post', '/api/v1/habits', {
      name: '  Drink water ',
      description: 'Two litres',
      category: 'Health',
      color: '#3B82F6',
      icon: 'droplet',
      frequencyType: 'daily',
    });

    expect(res.status).toBe(201);
    expect(res.body.habit).toEqual({
      id: expect.any(String),
      workspaceId: expect.any(String),
      createdBy: ctx.user.id,
      name: 'Drink water',
      description: 'Two litres',
      category: 'Health',
      color: '#3B82F6',
      icon: 'droplet',
      frequencyType: 'daily',
      weekdays: null,
      targetPerWeek: null,
      startDate: '2026-10-24', // New York date, although it is already the 25th in UTC
      status: 'active',
      archivedAt: null,
      sortOrder: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('creates a weekdays habit with its schedule days (returned sorted)', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [5, 1, 3] });

    expect(habit.weekdays).toEqual([1, 3, 5]);
    const rows = await HabitScheduleDay.findAll({ where: { habitId: habit.id } });
    expect(rows.map((r) => r.weekday).sort()).toEqual([1, 3, 5]);
  });

  it('creates a weekly_target habit', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, {
      frequencyType: 'weekly_target',
      targetPerWeek: 3,
      startDate: '2026-10-19',
    });
    expect(habit).toMatchObject({ targetPerWeek: 3, weekdays: null, startDate: '2026-10-19' });
  });

  it('accepts a past startDate (backfill) and one exactly 1 year ahead', async () => {
    const ctx = await signup();
    await createHabitViaApi(ctx, { startDate: '2020-01-01' });
    await createHabitViaApi(ctx, { startDate: '2027-10-24' });
  });

  it('puts each new habit at the end of the list', async () => {
    const ctx = await signup();
    const first = await createHabitViaApi(ctx, { name: 'A' });
    const second = await createHabitViaApi(ctx, { name: 'B' });
    expect([first.sortOrder, second.sortOrder]).toEqual([0, 1]);
  });

  it('turns empty optional strings into null', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { description: '   ', category: '' });
    expect(habit).toMatchObject({ description: null, category: null });
  });
});

describe('GET /habits/:id', () => {
  it("returns the habit with its schedule and the user's streak", async () => {
    const ctx = await signup();
    const created = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [2, 4] });
    const res = await call(ctx, 'get', `/api/v1/habits/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      habit: { ...created, weekdays: [2, 4] },
      // A Tue/Thu habit created on Saturday 24 Oct (New York): nothing is due today.
      streaks: { current: 0, longest: 0, unit: 'days', status: 'not_scheduled' },
    });
  });

  it('returns 404 for an id that does not exist', async () => {
    const ctx = await signup();
    const res = await call(ctx, 'get', '/api/v1/habits/7c9e6679-7425-40de-944b-e07fc1f90ae7');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Habit not found' } });
  });
});

describe('GET /habits', () => {
  it('lists active habits only by default, in sortOrder, with pagination meta', async () => {
    const ctx = await signup();
    const a = await createHabitViaApi(ctx, { name: 'A' });
    const b = await createHabitViaApi(ctx, { name: 'B', frequencyType: 'weekdays', weekdays: [1] });
    const archived = await createHabitViaApi(ctx, { name: 'Old' });
    await call(ctx, 'post', `/api/v1/habits/${archived.id}/archive`);

    const res = await call(ctx, 'get', '/api/v1/habits');
    expect(res.status).toBe(200);
    expect(res.body.data.map((h) => h.id)).toEqual([a.id, b.id]);
    expect(res.body.data[1].weekdays).toEqual([1]);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2 });
  });

  it('filters by status=archived and status=all', async () => {
    const ctx = await signup();
    await createHabitViaApi(ctx, { name: 'Live' });
    const old = await createHabitViaApi(ctx, { name: 'Old' });
    await call(ctx, 'post', `/api/v1/habits/${old.id}/archive`);

    const archived = await call(ctx, 'get', '/api/v1/habits?status=archived');
    expect(archived.body.data.map((h) => h.name)).toEqual(['Old']);
    const all = await call(ctx, 'get', '/api/v1/habits?status=all');
    expect(all.body.meta.total).toBe(2);
  });

  it('filters by category and by a case-insensitive name search', async () => {
    const ctx = await signup();
    await createHabitViaApi(ctx, { name: 'Morning run', category: 'Fitness' });
    await createHabitViaApi(ctx, { name: 'Evening RUN', category: 'Fitness' });
    await createHabitViaApi(ctx, { name: 'Read', category: 'Learning' });

    const fitness = await call(ctx, 'get', '/api/v1/habits?category=Fitness');
    expect(fitness.body.meta.total).toBe(2);
    const search = await call(ctx, 'get', '/api/v1/habits?search=run');
    expect(search.body.data.map((h) => h.name)).toEqual(['Morning run', 'Evening RUN']);
  });

  it('treats % and _ in the search text literally', async () => {
    const ctx = await signup();
    await createHabitViaApi(ctx, { name: 'Hit 100% of steps' });
    await createHabitViaApi(ctx, { name: 'Hit 1000 steps' });

    const res = await call(ctx, 'get', `/api/v1/habits?search=${encodeURIComponent('100%')}`);
    expect(res.body.data.map((h) => h.name)).toEqual(['Hit 100% of steps']);
  });

  it('paginates', async () => {
    const ctx = await signup();
    for (const name of ['A', 'B', 'C']) await createHabitViaApi(ctx, { name });
    const res = await call(ctx, 'get', '/api/v1/habits?page=2&limit=2');
    expect(res.body.data.map((h) => h.name)).toEqual(['C']);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3 });
  });
});

describe('GET /habits/categories', () => {
  it('returns the distinct categories of the workspace, A-Z', async () => {
    const ctx = await signup();
    await createHabitViaApi(ctx, { name: '1', category: 'Health' });
    await createHabitViaApi(ctx, { name: '2', category: 'Fitness' });
    await createHabitViaApi(ctx, { name: '3', category: 'Health' });
    await createHabitViaApi(ctx, { name: '4' }); // no category

    const res = await call(ctx, 'get', '/api/v1/habits/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: ['Fitness', 'Health'] });
  });
});

describe('PATCH /habits/:id', () => {
  it('updates simple fields and clears nullable ones', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { category: 'Health', color: '#000000' });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      name: 'Hydrate',
      category: null,
      color: '#FFFFFF',
      startDate: '2026-10-01',
    });

    expect(res.status).toBe(200);
    expect(res.body.habit).toMatchObject({
      name: 'Hydrate',
      category: null,
      color: '#FFFFFF',
      startDate: '2026-10-01',
    });
  });

  it('replaces the schedule days when weekdays change', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [1, 2] });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { weekdays: [6, 7] });

    expect(res.body.habit.weekdays).toEqual([6, 7]);
    const rows = await HabitScheduleDay.findAll({ where: { habitId: habit.id } });
    expect(rows.map((r) => r.weekday).sort()).toEqual([6, 7]);
  });

  it('keeps the schedule days when only other fields change', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [3] });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { name: 'Renamed' });
    expect(res.body.habit.weekdays).toEqual([3]);
  });

  it('weekdays -> daily removes the schedule days', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [1, 3] });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { frequencyType: 'daily' });

    expect(res.status).toBe(200);
    expect(res.body.habit).toMatchObject({ frequencyType: 'daily', weekdays: null });
    expect(await HabitScheduleDay.count({ where: { habitId: habit.id } })).toBe(0);
  });

  it('weekly_target -> daily clears targetPerWeek automatically', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, {
      frequencyType: 'weekly_target',
      targetPerWeek: 4,
    });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { frequencyType: 'daily' });
    expect(res.body.habit).toMatchObject({ frequencyType: 'daily', targetPerWeek: null });
  });

  it('daily -> weekly_target sets targetPerWeek; daily -> weekdays sets the days', async () => {
    const ctx = await signup();
    const a = await createHabitViaApi(ctx, { name: 'A' });
    const b = await createHabitViaApi(ctx, { name: 'B' });

    const resA = await call(ctx, 'patch', `/api/v1/habits/${a.id}`, {
      frequencyType: 'weekly_target',
      targetPerWeek: 2,
    });
    expect(resA.body.habit).toMatchObject({ frequencyType: 'weekly_target', targetPerWeek: 2 });

    const resB = await call(ctx, 'patch', `/api/v1/habits/${b.id}`, {
      frequencyType: 'weekdays',
      weekdays: [1, 5],
    });
    expect(resB.body.habit).toMatchObject({ frequencyType: 'weekdays', weekdays: [1, 5] });
  });

  it('weekly_target: changing only targetPerWeek keeps the type', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, {
      frequencyType: 'weekly_target',
      targetPerWeek: 2,
    });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { targetPerWeek: 5 });
    expect(res.body.habit).toMatchObject({ frequencyType: 'weekly_target', targetPerWeek: 5 });
  });
});

describe('archive and unarchive', () => {
  it('POST /archive sets status and archivedAt; POST /unarchive clears them', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);

    const archived = await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.habit).toMatchObject({
      status: 'archived',
      archivedAt: NOW.toISOString(),
    });

    const restored = await call(ctx, 'post', `/api/v1/habits/${habit.id}/unarchive`);
    expect(restored.body.habit).toMatchObject({ status: 'active', archivedAt: null });
  });

  it('is idempotent: repeating archive or unarchive is a 200 no-op', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);
    const url = (action) => `/api/v1/habits/${habit.id}/${action}`;

    const first = await call(ctx, 'post', url('archive'));
    const second = await call(ctx, 'post', url('archive'));
    expect(second.status).toBe(200);
    // The archive time is not moved by the repeated call.
    expect(second.body.habit.archivedAt).toBe(first.body.habit.archivedAt);

    await call(ctx, 'post', url('unarchive'));
    const again = await call(ctx, 'post', url('unarchive'));
    expect(again.status).toBe(200);
    expect(again.body.habit.status).toBe('active');
  });

  it('PATCH status archives and restores as well', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);
    const archived = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { status: 'archived' });
    expect(archived.body.habit.status).toBe('archived');
    const restored = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { status: 'active' });
    expect(restored.body.habit).toMatchObject({ status: 'active', archivedAt: null });
  });

  it('archived habits: name and description may change, anything else is 409 HABIT_ARCHIVED', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);
    await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);

    const rename = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      name: 'Renamed',
      description: 'Still archived',
    });
    expect(rename.status).toBe(200);
    expect(rename.body.habit).toMatchObject({ name: 'Renamed', status: 'archived' });

    const blocked = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      category: 'X',
      frequencyType: 'weekly_target',
      targetPerWeek: 2,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({
      code: 'HABIT_ARCHIVED',
      details: { fields: ['category', 'frequencyType', 'targetPerWeek'] },
    });
  });

  it('allows other edits together with restoring (status: active)', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);
    await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      status: 'active',
      category: 'Back',
    });
    expect(res.status).toBe(200);
    expect(res.body.habit).toMatchObject({ status: 'active', category: 'Back' });
  });
});

describe('DELETE /habits/:id', () => {
  it('archives by default (204) and keeps the history', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);
    await HabitCompletion.create({
      habitId: habit.id,
      completedBy: ctx.user.id,
      completionDate: '2026-10-24',
    });

    const res = await call(ctx, 'delete', `/api/v1/habits/${habit.id}`);
    expect(res.status).toBe(204);
    const stored = await Habit.findByPk(habit.id);
    expect(stored.status).toBe('archived');
    expect(await HabitCompletion.count()).toBe(1);
  });

  it('refuses permanent deletion of an active habit (409 HABIT_NOT_ARCHIVED)', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx);
    const res = await call(ctx, 'delete', `/api/v1/habits/${habit.id}?permanent=true`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HABIT_NOT_ARCHIVED');
    expect(await Habit.count()).toBe(1);
  });

  it('permanently deletes an archived habit with its schedule, completions and reminders', async () => {
    const ctx = await signup();
    const habit = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [1, 2] });
    const kept = await createHabitViaApi(ctx, { name: 'Kept' });
    for (const h of [habit, kept]) {
      await HabitCompletion.create({
        habitId: h.id,
        completedBy: ctx.user.id,
        completionDate: '2026-10-20',
      });
    }
    await HabitReminder.create({ habitId: habit.id, userId: ctx.user.id, remindAt: '08:00' });

    await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);
    const res = await call(ctx, 'delete', `/api/v1/habits/${habit.id}?permanent=true`);

    expect(res.status).toBe(204);
    expect(await Habit.findByPk(habit.id)).toBeNull();
    // No orphans left behind...
    expect(await HabitScheduleDay.count({ where: { habitId: habit.id } })).toBe(0);
    expect(await HabitCompletion.count({ where: { habitId: habit.id } })).toBe(0);
    expect(await HabitReminder.count({ where: { habitId: habit.id } })).toBe(0);
    // ...and the other habit's history is untouched.
    expect(await HabitCompletion.count({ where: { habitId: kept.id } })).toBe(1);
    expect((await call(ctx, 'get', `/api/v1/habits/${habit.id}`)).status).toBe(404);
  });
});

describe('PATCH /habits/reorder', () => {
  it('sets the new order in one request', async () => {
    const ctx = await signup();
    const a = await createHabitViaApi(ctx, { name: 'A' });
    const b = await createHabitViaApi(ctx, { name: 'B' });
    const c = await createHabitViaApi(ctx, { name: 'C' });

    const res = await call(ctx, 'patch', '/api/v1/habits/reorder', {
      items: [
        { id: c.id, sortOrder: 0 },
        { id: a.id, sortOrder: 1 },
        { id: b.id, sortOrder: 2 },
      ],
    });
    expect(res.status).toBe(204);

    const list = await call(ctx, 'get', '/api/v1/habits');
    expect(list.body.data.map((h) => h.name)).toEqual(['C', 'A', 'B']);
  });
});
