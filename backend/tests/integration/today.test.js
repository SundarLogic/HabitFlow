/**
 * GET /api/v1/today: the dashboard's daily overview.
 *
 * Time is controlled with Jest FAKE TIMERS (only `Date` is faked; real timers keep the database
 * driver and Supertest working). The app uses the real clock here (no injected `now`), so this
 * also proves that the production code path derives "today" from the user's timezone.
 *
 * Frozen instant: 2026-10-26 02:30 UTC
 *   = Sunday 2026-10-25 22:30 in New York (UTC-4)
 *   = Monday 2026-10-26 15:30 in Auckland (UTC+13)
 * So for the SAME instant, a Mon/Wed/Fri habit is not due in New York but is due in Auckland.
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import { sequelize } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp(); // real clock, faked below
const done = (ctx, habit, date) =>
  call(ctx, 'put', `/api/v1/habits/${habit.id}/completions/${date}`);
const today = (ctx, query = '') => call(ctx, 'get', `/api/v1/today${query}`);

beforeAll(seedPlans);
beforeEach(async () => {
  // Fake only Date: everything else (setTimeout, setImmediate, nextTick...) stays real.
  jest.useFakeTimers({
    now: new Date('2026-10-26T02:30:00Z'),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });
  await truncateAllTables({ except: ['plans'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('a different calendar day than UTC', () => {
  it('New York: still Sunday the 25th, so the Mon/Wed/Fri habit is not listed', async () => {
    const ny = await signupAgent(app, { timezone: 'America/New_York' });
    await createHabitViaApi(ny, { name: 'Daily', startDate: '2026-10-01' });
    await createHabitViaApi(ny, {
      name: 'MWF',
      frequencyType: 'weekdays',
      weekdays: [1, 3, 5],
      startDate: '2026-10-01',
    });

    const res = await today(ny);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: '2026-10-25', today: '2026-10-25' });
    expect(res.body.habits.map((h) => h.habit.name)).toEqual(['Daily']);
  });

  it('Auckland: already Monday the 26th, so the Mon/Wed/Fri habit IS listed', async () => {
    const akl = await signupAgent(app, { timezone: 'Pacific/Auckland' });
    await createHabitViaApi(akl, { name: 'Daily', startDate: '2026-10-01' });
    await createHabitViaApi(akl, {
      name: 'MWF',
      frequencyType: 'weekdays',
      weekdays: [1, 3, 5],
      startDate: '2026-10-01',
    });

    const res = await today(akl);
    expect(res.body).toMatchObject({ date: '2026-10-26', today: '2026-10-26' });
    expect(res.body.habits.map((h) => h.habit.name)).toEqual(['Daily', 'MWF']);
  });

  it("New York can't complete the 26th yet (future for them), Auckland can", async () => {
    const ny = await signupAgent(app, { timezone: 'America/New_York' });
    const akl = await signupAgent(app, { timezone: 'Pacific/Auckland' });
    const nyHabit = await createHabitViaApi(ny, { startDate: '2026-10-01' });
    const aklHabit = await createHabitViaApi(akl, { startDate: '2026-10-01' });

    const nyRes = await done(ny, nyHabit, '2026-10-26');
    expect(nyRes.status).toBe(422);
    expect(nyRes.body.error.details.reason).toBe('DATE_IN_FUTURE');
    expect((await done(akl, aklHabit, '2026-10-26')).status).toBe(201);
  });

  it('the day rolls over at local midnight', async () => {
    const ny = await signupAgent(app, { timezone: 'America/New_York' });
    await createHabitViaApi(ny, { startDate: '2026-10-01' });
    jest.setSystemTime(new Date('2026-10-26T04:00:00Z')); // 00:00 Monday in New York
    expect((await today(ny)).body.date).toBe('2026-10-26');
  });
});

describe('content and summary (New York user, today = Sunday 2026-10-25)', () => {
  let ny;
  let daily;
  let weekly;
  beforeEach(async () => {
    ny = await signupAgent(app, { timezone: 'America/New_York' });
    daily = await createHabitViaApi(ny, { name: 'Water', startDate: '2026-10-01' });
    weekly = await createHabitViaApi(ny, {
      name: 'Run',
      frequencyType: 'weekly_target',
      targetPerWeek: 3,
      startDate: '2026-10-05', // a Monday
    });
    await createHabitViaApi(ny, {
      name: 'Gym',
      frequencyType: 'weekdays',
      weekdays: [1, 3, 5],
      startDate: '2026-10-01',
    });
    const archived = await createHabitViaApi(ny, { name: 'Old', startDate: '2026-10-01' });
    await call(ny, 'post', `/api/v1/habits/${archived.id}/archive`);

    for (const date of ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']) {
      await done(ny, daily, date);
    }
    for (const date of ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-20', '2026-10-21']) {
      await done(ny, weekly, date);
    }
  });

  it('lists scheduled active habits with completion, status, streak and week progress', async () => {
    const res = await today(ny);

    expect(res.headers['cache-control']).toBe('no-store');
    // Gym (Mon/Wed/Fri) isn't due on Sunday; the archived habit is never listed.
    expect(res.body.habits.map((h) => h.habit.name)).toEqual(['Water', 'Run']);

    const [water, run] = res.body.habits;
    expect(water).toEqual({
      habit: expect.objectContaining({ id: daily.id, name: 'Water' }),
      completed: true,
      completion: expect.objectContaining({ completionDate: '2026-10-25', habitId: daily.id }),
      status: 'completed',
      streak: { current: 4, longest: 4, unit: 'days' },
    });
    // Run: week of Oct 12 met (3), week of Oct 19 has 2 of 3 and ends tonight -> still pending.
    expect(run).toEqual({
      habit: expect.objectContaining({ id: weekly.id }),
      completed: false,
      completion: null,
      status: 'pending',
      streak: { current: 1, longest: 1, unit: 'weeks' },
      weekProgress: { done: 2, target: 3 },
    });
    expect(res.body.summary).toEqual({ scheduled: 2, completed: 1, remaining: 1, percent: 50 });
  });

  it('?date= shows a past day: unfinished scheduled days are missed', async () => {
    const res = await today(ny, '?date=2026-10-21'); // Wednesday
    const byName = Object.fromEntries(res.body.habits.map((h) => [h.habit.name, h]));

    expect(res.body).toMatchObject({ date: '2026-10-21', today: '2026-10-25' });
    expect(byName.Water.status).toBe('missed');
    expect(byName.Gym.status).toBe('missed');
    expect(byName.Run).toMatchObject({ status: 'completed', completed: true });
    // Streaks are always "as of today", whatever day is being viewed.
    expect(byName.Water.streak.current).toBe(4);
    expect(res.body.summary).toEqual({ scheduled: 3, completed: 1, remaining: 0, percent: 33 });
  });

  it('?date= in the future shows upcoming habits', async () => {
    const res = await today(ny, '?date=2026-10-26'); // Monday
    expect(res.body.habits.map((h) => [h.habit.name, h.status])).toEqual([
      ['Water', 'upcoming'],
      ['Run', 'upcoming'],
      ['Gym', 'upcoming'],
    ]);
    expect(res.body.summary).toMatchObject({ completed: 0, remaining: 0 });
  });

  it('reflects an undo immediately (nothing is cached)', async () => {
    await call(ny, 'delete', `/api/v1/habits/${daily.id}/completions/2026-10-25`);
    const water = (await today(ny)).body.habits[0];
    expect(water).toMatchObject({
      completed: false,
      status: 'pending',
      // Pending today doesn't break 22-24; the 4-day run is gone because the 25th was undone.
      streak: { current: 3, longest: 3 },
    });
  });

  it('rejects a malformed ?date=', async () => {
    const res = await today(ny, '?date=2026-13-01');
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ location: 'query', path: 'date' });
  });
});

it('an empty day has a null percentage (no division by zero)', async () => {
  const ny = await signupAgent(app, { timezone: 'America/New_York' });
  const res = await today(ny);
  expect(res.body.habits).toEqual([]);
  expect(res.body.summary).toEqual({ scheduled: 0, completed: 0, remaining: 0, percent: null });
});

it('uses the same number of queries for 2 habits as for 8 (no N+1)', async () => {
  const ny = await signupAgent(app, { timezone: 'America/New_York' });
  const countQueries = async () => {
    let count = 0;
    sequelize.addHook('beforeQuery', 'countQueries', () => {
      count += 1;
    });
    try {
      expect((await today(ny)).status).toBe(200);
    } finally {
      sequelize.removeHook('beforeQuery', 'countQueries');
    }
    return count;
  };

  for (let i = 0; i < 2; i += 1) {
    const habit = await createHabitViaApi(ny, { name: `H${i}`, startDate: '2026-10-01' });
    await done(ny, habit, '2026-10-24');
  }
  const withTwo = await countQueries();

  for (let i = 2; i < 8; i += 1) {
    const habit = await createHabitViaApi(ny, { name: `H${i}`, startDate: '2026-10-01' });
    await done(ny, habit, '2026-10-24');
  }
  const withEight = await countQueries();

  expect(withEight).toBe(withTwo);
});

it('requires authentication', async () => {
  expect((await request(app).get('/api/v1/today')).status).toBe(401);
});
