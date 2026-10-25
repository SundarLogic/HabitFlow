/**
 * Plan entitlements for habits (entitlementService, CLAUDE.md §3.1): the free plan allows 10
 * ACTIVE habits. Creating an 11th, or restoring one while at the limit, is 403
 * PLAN_LIMIT_REACHED with { limit, current }. Archived habits don't count.
 */
import { Habit, Plan, WorkspaceSubscription } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp();
const LIMIT_ERROR = {
  code: 'PLAN_LIMIT_REACHED',
  message: 'Your plan allows up to 10 active habits',
  details: { limit: 10, current: 10 },
};

/** Creates `count` habits named H1, H2, ... and returns them. */
async function createHabits(ctx, count) {
  const habits = [];
  for (let i = 1; i <= count; i += 1) habits.push(await createHabitViaApi(ctx, { name: `H${i}` }));
  return habits;
}

let ctx;
beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  ctx = await signupAgent(app);
});

it('allows 10 active habits and rejects the 11th with 403 PLAN_LIMIT_REACHED', async () => {
  await createHabits(ctx, 10);
  const res = await call(ctx, 'post', '/api/v1/habits', { name: 'H11', frequencyType: 'daily' });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: LIMIT_ERROR });
  expect(await Habit.count()).toBe(10);
});

it('frees a slot when a habit is archived', async () => {
  const habits = await createHabits(ctx, 10);
  await call(ctx, 'post', `/api/v1/habits/${habits[0].id}/archive`);

  const res = await call(ctx, 'post', '/api/v1/habits', { name: 'H11', frequencyType: 'daily' });
  expect(res.status).toBe(201);
});

it('blocks restoring an archived habit while at the limit (endpoint and PATCH)', async () => {
  const habits = await createHabits(ctx, 10);
  await call(ctx, 'post', `/api/v1/habits/${habits[0].id}/archive`);
  await createHabitViaApi(ctx, { name: 'Replacement' }); // back at 10 active

  const viaEndpoint = await call(ctx, 'post', `/api/v1/habits/${habits[0].id}/unarchive`);
  expect(viaEndpoint.status).toBe(403);
  expect(viaEndpoint.body).toEqual({ error: LIMIT_ERROR });

  const viaPatch = await call(ctx, 'patch', `/api/v1/habits/${habits[0].id}`, { status: 'active' });
  expect(viaPatch.status).toBe(403);
  expect((await Habit.findByPk(habits[0].id)).status).toBe('archived');
});

it('allows restoring when below the limit', async () => {
  const habits = await createHabits(ctx, 10);
  await call(ctx, 'post', `/api/v1/habits/${habits[0].id}/archive`);
  const res = await call(ctx, 'post', `/api/v1/habits/${habits[0].id}/unarchive`);
  expect(res.status).toBe(200);
});

it('does not limit edits to existing habits at the limit', async () => {
  const habits = await createHabits(ctx, 10);
  const res = await call(ctx, 'patch', `/api/v1/habits/${habits[0].id}`, { name: 'Renamed' });
  expect(res.status).toBe(200);
});

it('reads the limit from the plan: the pro plan (null) is unlimited', async () => {
  const pro = await Plan.findOne({ where: { code: 'pro' } });
  await WorkspaceSubscription.update({ planId: pro.id }, { where: {} });
  await createHabits(ctx, 12);
  expect(await Habit.count({ where: { status: 'active' } })).toBe(12);
});

it('uses a changed limit without a code change', async () => {
  await Plan.update(
    { limits: { maxActiveHabits: 2, historyDays: null } },
    { where: { code: 'free' } },
  );
  try {
    await createHabits(ctx, 2);
    const res = await call(ctx, 'post', '/api/v1/habits', { name: 'H3', frequencyType: 'daily' });
    expect(res.status).toBe(403);
    expect(res.body.error.details).toEqual({ limit: 2, current: 2 });
  } finally {
    await seedPlans(); // the seeder upserts the original limits back
  }
});

it('cannot be exceeded by concurrent requests (workspace row lock)', async () => {
  await createHabits(ctx, 8);
  // Fire 5 creates at once with 2 slots left: exactly 2 may succeed.
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map((i) =>
      call(ctx, 'post', '/api/v1/habits', { name: `Race ${i}`, frequencyType: 'daily' }),
    ),
  );
  const statuses = results.map((res) => res.status).sort();
  expect(statuses).toEqual([201, 201, 403, 403, 403]);
  expect(await Habit.count({ where: { status: 'active' } })).toBe(10);
});
