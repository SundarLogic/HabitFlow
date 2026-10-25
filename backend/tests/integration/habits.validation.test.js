/**
 * Validation rules for the habit endpoints (all -> 422 VALIDATION_ERROR with details):
 * field rules, the cross-field schedule rules (on create, and on the MERGED state for update),
 * the startDate window, and malformed ids / query values.
 *
 * Clock frozen at 2026-10-25 03:30 UTC; users are in America/New_York (today = 2026-10-24).
 */
import { Habit } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp({ now: () => new Date('2026-10-25T03:30:00Z') });
const signup = () => signupAgent(app, { timezone: 'America/New_York' });

/** Asserts a 422 VALIDATION_ERROR whose details include `path`. */
function expect422(res, path, location = 'body') {
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(res.body.error.details).toEqual(
    expect.arrayContaining([expect.objectContaining({ location, path })]),
  );
}

let ctx;
beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  ctx = await signup();
});

describe('POST /habits field rules', () => {
  const base = { name: 'Run', frequencyType: 'daily' };

  it.each([
    ['missing name', { name: undefined }, 'name'],
    ['blank name', { name: '   ' }, 'name'],
    ['name over 100 chars', { name: 'x'.repeat(101) }, 'name'],
    ['description over 500 chars', { description: 'x'.repeat(501) }, 'description'],
    ['category over 50 chars', { category: 'x'.repeat(51) }, 'category'],
    ['icon over 50 chars', { icon: 'x'.repeat(51) }, 'icon'],
    ['color not #RRGGBB', { color: 'blue' }, 'color'],
    ['short color', { color: '#FFF' }, 'color'],
    ['missing frequencyType', { frequencyType: undefined }, 'frequencyType'],
    ['unknown frequencyType', { frequencyType: 'monthly' }, 'frequencyType'],
    ['startDate in the wrong format', { startDate: '24/10/2026' }, 'startDate'],
    ['startDate that does not exist', { startDate: '2026-02-30' }, 'startDate'],
    ['startDate with a time part', { startDate: '2026-10-24T00:00:00Z' }, 'startDate'],
  ])('rejects %s', async (_label, override, path) => {
    const res = await call(ctx, 'post', '/api/v1/habits', { ...base, ...override });
    expect422(res, path);
    expect(await Habit.count()).toBe(0);
  });

  it('rejects a startDate more than 1 year after today (user timezone)', async () => {
    // Today in New York is 2026-10-24, so the latest allowed start is 2027-10-24.
    const res = await call(ctx, 'post', '/api/v1/habits', { ...base, startDate: '2027-10-25' });
    expect422(res, 'startDate');
    expect(res.body.error.details[0].message).toMatch(/2027-10-24/);
  });
});

describe('POST /habits schedule rules', () => {
  it.each([
    ['weekdays without weekdays', { frequencyType: 'weekdays' }, 'weekdays'],
    ['weekdays with an empty list', { frequencyType: 'weekdays', weekdays: [] }, 'weekdays'],
    ['weekdays with day 0', { frequencyType: 'weekdays', weekdays: [0, 1] }, 'weekdays.0'],
    ['weekdays with day 8', { frequencyType: 'weekdays', weekdays: [8] }, 'weekdays.0'],
    ['weekdays with a fraction', { frequencyType: 'weekdays', weekdays: [1.5] }, 'weekdays.0'],
    ['duplicate weekdays', { frequencyType: 'weekdays', weekdays: [1, 1] }, 'weekdays'],
    ['weekdays on a daily habit', { frequencyType: 'daily', weekdays: [1] }, 'weekdays'],
    [
      'weekdays on a weekly_target habit',
      { frequencyType: 'weekly_target', targetPerWeek: 2, weekdays: [1] },
      'weekdays',
    ],
    ['weekly_target without a target', { frequencyType: 'weekly_target' }, 'targetPerWeek'],
    ['target 0', { frequencyType: 'weekly_target', targetPerWeek: 0 }, 'targetPerWeek'],
    ['target 8', { frequencyType: 'weekly_target', targetPerWeek: 8 }, 'targetPerWeek'],
    ['a string target', { frequencyType: 'weekly_target', targetPerWeek: '3' }, 'targetPerWeek'],
    ['target on a daily habit', { frequencyType: 'daily', targetPerWeek: 3 }, 'targetPerWeek'],
    [
      'target on a weekdays habit',
      { frequencyType: 'weekdays', weekdays: [1], targetPerWeek: 3 },
      'targetPerWeek',
    ],
  ])('rejects %s', async (_label, body, path) => {
    const res = await call(ctx, 'post', '/api/v1/habits', { name: 'X', ...body });
    expect422(res, path);
  });

  it('accepts explicit nulls for fields that do not apply', async () => {
    const res = await call(ctx, 'post', '/api/v1/habits', {
      name: 'X',
      frequencyType: 'daily',
      weekdays: null,
      targetPerWeek: null,
    });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /habits/:id rules (checked on the merged state)', () => {
  it('rejects an empty body', async () => {
    const habit = await createHabitViaApi(ctx);
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {});
    expect(res.status).toBe(422);
  });

  it('switching to weekdays requires weekdays', async () => {
    const habit = await createHabitViaApi(ctx);
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      frequencyType: 'weekdays',
    });
    expect422(res, 'weekdays');
  });

  it('switching to weekly_target requires targetPerWeek', async () => {
    const habit = await createHabitViaApi(ctx);
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      frequencyType: 'weekly_target',
    });
    expect422(res, 'targetPerWeek');
  });

  it('weekdays are forbidden on a daily habit even when only weekdays are sent', async () => {
    const habit = await createHabitViaApi(ctx);
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { weekdays: [1] });
    expect422(res, 'weekdays');
  });

  it('targetPerWeek is forbidden when leaving weekly_target', async () => {
    const habit = await createHabitViaApi(ctx, {
      frequencyType: 'weekly_target',
      targetPerWeek: 3,
    });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      frequencyType: 'daily',
      targetPerWeek: 3,
    });
    expect422(res, 'targetPerWeek');
  });

  it('a weekdays habit cannot have its weekdays removed', async () => {
    const habit = await createHabitViaApi(ctx, { frequencyType: 'weekdays', weekdays: [1] });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { weekdays: null });
    expect422(res, 'weekdays');
  });

  it('a weekly_target habit cannot have its target removed', async () => {
    const habit = await createHabitViaApi(ctx, {
      frequencyType: 'weekly_target',
      targetPerWeek: 3,
    });
    const res = await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { targetPerWeek: null });
    expect422(res, 'targetPerWeek');
  });

  it('applies the field rules and the startDate window', async () => {
    const habit = await createHabitViaApi(ctx);
    expect422(await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { name: '' }), 'name');
    expect422(
      await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { startDate: '2030-01-01' }),
      'startDate',
    );
    expect422(
      await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, { status: 'deleted' }),
      'status',
    );
  });

  it('leaves the habit unchanged when validation fails', async () => {
    const habit = await createHabitViaApi(ctx, { name: 'Original' });
    await call(ctx, 'patch', `/api/v1/habits/${habit.id}`, {
      name: 'Changed',
      frequencyType: 'weekdays',
    });
    expect((await Habit.findByPk(habit.id)).name).toBe('Original');
  });
});

describe('ids and query parameters', () => {
  it.each([
    ['get', '/api/v1/habits/not-a-uuid'],
    ['patch', '/api/v1/habits/123'],
    ['delete', '/api/v1/habits/abc'],
    ['post', '/api/v1/habits/abc/archive'],
    ['post', '/api/v1/habits/abc/unarchive'],
  ])('%s %s -> 422 for a malformed id (not 500)', async (method, url) => {
    const res = await call(ctx, method, url, method === 'patch' ? { name: 'X' } : undefined);
    expect422(res, 'id', 'params');
  });

  it.each([
    ['status=deleted', 'status'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['page=0', 'page'],
  ])('GET /habits?%s -> 422', async (query, path) => {
    expect422(await call(ctx, 'get', `/api/v1/habits?${query}`), path, 'query');
  });

  it('DELETE ?permanent must be true or false', async () => {
    const habit = await createHabitViaApi(ctx);
    const res = await call(ctx, 'delete', `/api/v1/habits/${habit.id}?permanent=yes`);
    expect422(res, 'permanent', 'query');
  });

  it('reorder rejects an empty list, duplicate ids, bad ids and negative positions', async () => {
    const habit = await createHabitViaApi(ctx);
    const url = '/api/v1/habits/reorder';
    expect422(await call(ctx, 'patch', url, { items: [] }), 'items');
    expect422(
      await call(ctx, 'patch', url, {
        items: [
          { id: habit.id, sortOrder: 1 },
          { id: habit.id, sortOrder: 2 },
        ],
      }),
      'items',
    );
    expect422(await call(ctx, 'patch', url, { items: [{ id: 'x', sortOrder: 1 }] }), 'items.0.id');
    expect422(
      await call(ctx, 'patch', url, { items: [{ id: habit.id, sortOrder: -1 }] }),
      'items.0.sortOrder',
    );
  });
});
