/**
 * GET /analytics/summary, GET /analytics/heatmap and GET /habits/:id/history, checked against a
 * fixture whose expected numbers are worked out BY HAND below.
 *
 * Clock: Wednesday 2026-10-28 16:00 UTC = 12:00 in New York -> today = Wed 2026-10-28.
 * Range: Mon 2026-10-19 .. Wed 2026-10-28 (10 days, two ISO weeks: 19-25 and 26-Nov 1).
 *
 *   Mon 19  Tue 20  Wed 21  Thu 22  Fri 23  Sat 24  Sun 25 | Mon 26  Tue 27  Wed 28 (today)
 *
 * A "Water"  daily, Health. Done 19 20 21 22 23 . 25 26 . 28
 *            Instances: 19..27 (9 past days) + 28 (done, so it counts) = 10; completed 8 -> 0.8
 * B "Gym"    Mon/Wed/Fri, Fitness. Done 19, 23, 26 (Wed 21 missed; Wed 28 still pending)
 *            Instances: 19, 21, 23, 26 (28 pending -> left out) = 4; completed 3 -> 0.75
 * C "Run"    weekly target 2, Fitness, started Mon Oct 5. Done 20, 22 | 26
 *            Week 19: 2/2 met -> 1 instance, completed. Week 26: 1/2 and still running -> not
 *            due yet. Instances 1; completed 1 -> 1.0
 * D "Old"    daily, Health, ARCHIVED on Wed 21 (18:00 New York). Done 19, 21
 *            Evaluated only up to the 21st: 19 done, 20 missed, 21 done = 3; completed 2 -> 0.6667
 *
 * overall      scheduled 10+4+1+3 = 18, completed 8+3+1+2 = 14 -> 14/18 = 0.7778
 * byCategory   Health  (A+D) 13 scheduled, 10 completed -> 0.7692
 *              Fitness (B+C)  5 scheduled,  4 completed -> 0.8
 * today (Wed)  A done, B pending (Wed), C pending (week 1/2); D archived -> not listed
 *              scheduled 3, completed 1, remaining 2, percent 33
 * daily (day-based habits A, B, D only):
 *   19: A B D all done 3/3 | 20: A done, D missed 1/2 | 21: A, D done, B missed 2/3
 *   22: A 1/1 | 23: A, B 2/2 | 24: A missed 0/1 | 25: A 1/1 | 26: A, B 2/2 | 27: A 0/1
 *   28: A done 1/1 (B pending, left out)        -> totals 13/17 = (8+3+2)/(10+4+3)
 * weekly   week 19: A 6/7 + B 2/3 + D 2/3 + C 1/1 = 11/14
 *          week 26: A 2/3 + B 1/1 (C not due)      =  3/4
 * streaks (as of today)
 *   A: 28 done, 27 missed -> current 1; longest 19..23 = 5 days
 *   B: 28 pending, 26 + 23 done, 21 missed -> current 2; longest 2
 *   C: week 26 pending, week 19 met, week 12 missed -> current 1; longest 1 (weeks)
 *   D: archived, days since are missed -> current 0; longest 1
 *   bestStreak = A with 5 days
 */
import request from 'supertest';
import { Habit, sequelize } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp({ now: () => new Date('2026-10-28T16:00:00Z') });
const RANGE = 'from=2026-10-19&to=2026-10-28';

let ctx;
let habits;
const done = (habit, dates) =>
  Promise.all(dates.map((d) => call(ctx, 'put', `/api/v1/habits/${habit.id}/completions/${d}`)));
const summary = (query = RANGE) => call(ctx, 'get', `/api/v1/analytics/summary?${query}`);

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  ctx = await signupAgent(app, { timezone: 'America/New_York' });
  const start = { startDate: '2026-10-01' };
  const a = await createHabitViaApi(ctx, { name: 'Water', category: 'Health', ...start });
  const b = await createHabitViaApi(ctx, {
    name: 'Gym',
    category: 'Fitness',
    frequencyType: 'weekdays',
    weekdays: [1, 3, 5],
    ...start,
  });
  const c = await createHabitViaApi(ctx, {
    name: 'Run',
    category: 'Fitness',
    frequencyType: 'weekly_target',
    targetPerWeek: 2,
    startDate: '2026-10-05',
  });
  const d = await createHabitViaApi(ctx, { name: 'Old', category: 'Health', ...start });
  habits = { a, b, c, d };

  await done(a, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
  await done(a, ['2026-10-25', '2026-10-26', '2026-10-28']);
  await done(b, ['2026-10-19', '2026-10-23', '2026-10-26']);
  await done(c, ['2026-10-20', '2026-10-22', '2026-10-26']);
  await done(d, ['2026-10-19', '2026-10-21']);
  await call(ctx, 'post', `/api/v1/habits/${d.id}/archive`);
  // Archive "on the 21st" (the API would stamp the frozen clock's time instead).
  await Habit.update(
    { status: 'archived', archivedAt: new Date('2026-10-21T22:00:00Z') },
    { where: { id: d.id } },
  );
});

describe('GET /analytics/summary (hand-calculated fixture)', () => {
  it('returns the expected range, today, overall, best streak and categories', async () => {
    const res = await summary();
    expect(res.status).toBe(200);
    expect(res.body.range).toEqual({ from: '2026-10-19', to: '2026-10-28' });
    expect(res.body.today).toEqual({ scheduled: 3, completed: 1, remaining: 2, percent: 33 });
    expect(res.body.overall).toEqual({ completionRate: 0.7778, completed: 14, scheduled: 18 });
    expect(res.body.bestStreak).toEqual({
      habitId: habits.a.id,
      name: 'Water',
      longest: 5,
      unit: 'days',
    });
    expect(res.body.byCategory).toEqual([
      { category: 'Health', completionRate: 0.7692, completed: 10, scheduled: 13 },
      { category: 'Fitness', completionRate: 0.8, completed: 4, scheduled: 5 },
    ]);
  });

  it('per habit: rates and streaks', async () => {
    const res = await summary();
    expect(res.body.byHabit).toEqual([
      {
        habitId: habits.a.id,
        name: 'Water',
        category: 'Health',
        status: 'active',
        completionRate: 0.8,
        completed: 8,
        scheduled: 10,
        currentStreak: 1,
        longestStreak: 5,
        unit: 'days',
      },
      expect.objectContaining({
        name: 'Gym',
        completionRate: 0.75,
        currentStreak: 2,
        longestStreak: 2,
      }),
      expect.objectContaining({
        name: 'Run',
        completionRate: 1,
        completed: 1,
        scheduled: 1,
        currentStreak: 1,
        unit: 'weeks',
      }),
      expect.objectContaining({
        name: 'Old',
        status: 'archived',
        completionRate: 0.6667,
        completed: 2,
        scheduled: 3,
        currentStreak: 0,
      }),
    ]);
  });

  it('daily and weekly series', async () => {
    const res = await summary();
    const daily = res.body.daily.map((d) => [d.date.slice(8), d.completed, d.scheduled]);
    expect(daily).toEqual([
      ['19', 3, 3],
      ['20', 1, 2],
      ['21', 2, 3],
      ['22', 1, 1],
      ['23', 2, 2],
      ['24', 0, 1],
      ['25', 1, 1],
      ['26', 2, 2],
      ['27', 0, 1],
      ['28', 1, 1],
    ]);
    expect(res.body.daily[1]).toEqual({
      date: '2026-10-20',
      scheduled: 2,
      completed: 1,
      rate: 0.5,
    });
    expect(res.body.weekly).toEqual([
      { weekStart: '2026-10-19', scheduled: 14, completed: 11, rate: 0.7857 },
      { weekStart: '2026-10-26', scheduled: 4, completed: 3, rate: 0.75 },
    ]);
  });

  it('habitId narrows every block to one habit', async () => {
    const res = await summary(`${RANGE}&habitId=${habits.b.id}`);
    expect(res.body.overall).toEqual({ completionRate: 0.75, completed: 3, scheduled: 4 });
    expect(res.body.today).toEqual({ scheduled: 1, completed: 0, remaining: 1, percent: 0 });
    expect(res.body.byHabit.map((h) => h.name)).toEqual(['Gym']);
    expect(res.body.byCategory).toEqual([
      { category: 'Fitness', completionRate: 0.75, completed: 3, scheduled: 4 },
    ]);
  });

  it('includeArchived=false leaves the archived habit out', async () => {
    const res = await summary(`${RANGE}&includeArchived=false`);
    // 18 - 3 (D) = 15 scheduled, 14 - 2 = 12 completed -> 0.8
    expect(res.body.overall).toEqual({ completionRate: 0.8, completed: 12, scheduled: 15 });
    expect(res.body.byHabit.map((h) => h.name)).toEqual(['Water', 'Gym', 'Run']);
  });

  it('a historical edit (back-filling Sat 24) changes the rate and the streak', async () => {
    await done(habits.a, ['2026-10-24']);
    const res = await summary();
    // A: 9/10 = 0.9 and 19..26 is now an 8-day run; overall 15/18.
    expect(res.body.byHabit[0]).toMatchObject({ completionRate: 0.9, longestStreak: 8 });
    expect(res.body.overall).toEqual({ completionRate: 0.8333, completed: 15, scheduled: 18 });
    expect(res.body.bestStreak.longest).toBe(8);
  });

  it('defaults to the last 30 days', async () => {
    const res = await summary('');
    expect(res.body.range).toEqual({ from: '2026-09-29', to: '2026-10-28' });
    expect(res.body.daily).toHaveLength(30);
  });
});

describe('empty states (zero denominators are null)', () => {
  it('a new user with no habits', async () => {
    const fresh = await signupAgent(app, { timezone: 'America/New_York' });
    const res = await call(fresh, 'get', `/api/v1/analytics/summary?${RANGE}`);
    expect(res.status).toBe(200);
    expect(res.body.today.percent).toBeNull();
    expect(res.body.overall).toEqual({ completionRate: null, completed: 0, scheduled: 0 });
    expect(res.body.bestStreak).toBeNull();
    expect(res.body.byHabit).toEqual([]);
    expect(res.body.daily.every((d) => d.rate === null)).toBe(true);
  });

  it('a range before any habit started', async () => {
    const res = await summary('from=2026-09-01&to=2026-09-30');
    expect(res.body.overall.completionRate).toBeNull();
    expect(res.body.byHabit.every((h) => h.completionRate === null)).toBe(true);
  });
});

describe('validation and authorization', () => {
  it.each([
    ['from=2025-10-01&to=2026-10-28', 'to'], // 393 days
    ['from=2026-10-28&to=2026-10-01', 'from'],
    ['from=2026-10-01', 'to'],
    ['to=2026-10-01', 'from'],
    ['habitId=not-a-uuid', 'habitId'],
    ['includeArchived=maybe', 'includeArchived'],
  ])('?%s -> 422', async (query, path) => {
    const res = await summary(query);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ location: 'query', path })]),
    );
  });

  it("another user's habitId -> 404 (no data leaks)", async () => {
    const other = await signupAgent(app);
    const theirs = await createHabitViaApi(other, { startDate: '2026-10-01' });
    const res = await summary(`${RANGE}&habitId=${theirs.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Habit not found');
  });

  it("never counts another user's habits or completions", async () => {
    const other = await signupAgent(app);
    const theirs = await createHabitViaApi(other, { startDate: '2026-10-01' });
    await call(other, 'put', `/api/v1/habits/${theirs.id}/completions/2026-10-27`);
    const res = await summary();
    expect(res.body.overall).toEqual({ completionRate: 0.7778, completed: 14, scheduled: 18 });
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/analytics/summary')).status).toBe(401);
    expect((await request(app).get('/api/v1/analytics/heatmap')).status).toBe(401);
  });
});

it('runs the same number of queries for 4 habits as for 10 (no N+1)', async () => {
  const countQueries = async () => {
    let count = 0;
    sequelize.addHook('beforeQuery', 'countQueries', () => {
      count += 1;
    });
    try {
      expect((await summary()).status).toBe(200);
    } finally {
      sequelize.removeHook('beforeQuery', 'countQueries');
    }
    return count;
  };

  const withFour = await countQueries();
  for (let i = 0; i < 6; i += 1) {
    const habit = await createHabitViaApi(ctx, { name: `Extra ${i}`, startDate: '2026-10-01' });
    await done(habit, ['2026-10-20', '2026-10-21']);
  }
  expect(await countQueries()).toBe(withFour);
});

describe('GET /analytics/heatmap', () => {
  it('?year= returns every day of the year with completed/scheduled counts', async () => {
    const res = await call(ctx, 'get', '/api/v1/analytics/heatmap?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.range).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(res.body.data).toHaveLength(365);
    const byDate = Object.fromEntries(res.body.data.map((d) => [d.date, d]));
    expect(byDate['2026-10-19']).toEqual({ date: '2026-10-19', completed: 3, scheduled: 3 });
    expect(byDate['2026-10-24']).toEqual({ date: '2026-10-24', completed: 0, scheduled: 1 });
    expect(byDate['2026-12-25']).toEqual({ date: '2026-12-25', completed: 0, scheduled: 0 });
  });

  it('?from&to returns that range; the default is the current year', async () => {
    const ranged = await call(
      ctx,
      'get',
      '/api/v1/analytics/heatmap?from=2026-10-26&to=2026-10-28',
    );
    expect(ranged.body.data.map((d) => d.completed)).toEqual([2, 0, 1]);
    const byDefault = await call(ctx, 'get', '/api/v1/analytics/heatmap');
    expect(byDefault.body.range).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it.each([
    ['year=2026&from=2026-01-01&to=2026-01-31', 'year'],
    ['year=1999', 'year'],
    ['from=2025-01-01&to=2026-06-30', 'to'],
  ])('?%s -> 422', async (query, path) => {
    const res = await call(ctx, 'get', `/api/v1/analytics/heatmap?${query}`);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe(path);
  });
});

describe('GET /habits/:id/history', () => {
  const history = (habit, query = 'from=2026-10-26&to=2026-10-30') =>
    call(ctx, 'get', `/api/v1/habits/${habit.id}/history?${query}`);

  it('returns a status for every day of the range', async () => {
    const res = await history(habits.b); // Mon/Wed/Fri
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      habitId: habits.b.id,
      range: { from: '2026-10-26', to: '2026-10-30' },
      data: [
        { date: '2026-10-26', status: 'completed', completed: true },
        { date: '2026-10-27', status: 'not_scheduled', completed: false },
        { date: '2026-10-28', status: 'pending', completed: false },
        { date: '2026-10-29', status: 'upcoming', completed: false },
        { date: '2026-10-30', status: 'upcoming', completed: false },
      ],
    });
  });

  it('daily habit: missed days are missed', async () => {
    const res = await history(habits.a, 'from=2026-10-23&to=2026-10-25');
    expect(res.body.data.map((d) => d.status)).toEqual(['completed', 'missed', 'completed']);
  });

  it('archived habit: days after the archive date are not_scheduled, not missed', async () => {
    const res = await history(habits.d, 'from=2026-10-19&to=2026-10-23');
    expect(res.body.data.map((d) => d.status)).toEqual([
      'completed',
      'missed',
      'completed',
      'not_scheduled',
      'not_scheduled',
    ]);
  });

  it('weekly habit: days report the state of their week', async () => {
    const res = await history(habits.c, 'from=2026-10-23&to=2026-10-28');
    // Week 19 met (2/2) -> completed; week 26 at 1/2 -> 26 done, 27/28 still pending.
    expect(res.body.data.map((d) => d.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'pending',
      'pending',
    ]);
  });

  it('defaults to the last 30 days', async () => {
    const res = await call(ctx, 'get', `/api/v1/habits/${habits.a.id}/history`);
    expect(res.body.range).toEqual({ from: '2026-09-29', to: '2026-10-28' });
    expect(res.body.data).toHaveLength(30);
  });

  it("404 for another user's habit; 422 for a bad id or range", async () => {
    const other = await signupAgent(app);
    const foreign = await call(other, 'get', `/api/v1/habits/${habits.a.id}/history`);
    expect(foreign.status).toBe(404);
    expect((await call(ctx, 'get', '/api/v1/habits/nope/history')).status).toBe(422);
    expect((await history(habits.a, 'from=2024-01-01&to=2026-01-01')).status).toBe(422);
  });
});
