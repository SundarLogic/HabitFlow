/**
 * Marking habits done: PUT / DELETE /habits/:id/completions/:date, and the completion history
 * GET /completions. Covers idempotency, races, every completable-date rule (CLAUDE.md §3.1),
 * streak recalculation after an undo, and workspace isolation.
 *
 * The app clock is frozen at Wednesday 2026-10-28 16:00 UTC = 12:00 in New York, so "today" for
 * the default user is 2026-10-28. Calendar: Mon 26, Tue 27, Wed 28, Thu 29.
 */
import request from 'supertest';
import { HabitCompletion } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const NOW = new Date('2026-10-28T16:00:00Z');
const app = createTestApp({ now: () => NOW });
const signup = (timezone = 'America/New_York') => signupAgent(app, { timezone });
const url = (habit, date) => `/api/v1/habits/${habit.id}/completions/${date}`;

let ctx;
let habit;
beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  ctx = await signup();
  habit = await createHabitViaApi(ctx, { startDate: '2026-10-01' }); // daily
});

describe('PUT /habits/:id/completions/:date', () => {
  it('creates a completion (201)', async () => {
    const res = await call(ctx, 'put', url(habit, '2026-10-28'));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      completion: {
        id: expect.any(String),
        habitId: habit.id,
        completedBy: ctx.user.id,
        completionDate: '2026-10-28',
        completedAt: NOW.toISOString(), // server time, in UTC
        note: null,
      },
    });
  });

  it('is idempotent: a second PUT returns 200 with the same completion and no new row', async () => {
    const first = await call(ctx, 'put', url(habit, '2026-10-28'));
    const second = await call(ctx, 'put', url(habit, '2026-10-28'));

    expect(second.status).toBe(200);
    expect(second.body.completion.id).toBe(first.body.completion.id);
    expect(await HabitCompletion.count()).toBe(1);
  });

  it('creates exactly one row under 5 concurrent PUTs', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(ctx, 'put', url(habit, '2026-10-27'))),
    );

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.completion.id)).size).toBe(1);
    expect(await HabitCompletion.count()).toBe(1);
  });

  it('stores an optional note, and a later PUT can change it', async () => {
    const created = await call(ctx, 'put', url(habit, '2026-10-28'), { note: '  2 litres ' });
    expect(created.body.completion.note).toBe('2 litres');

    const updated = await call(ctx, 'put', url(habit, '2026-10-28'), { note: '3 litres' });
    expect(updated.status).toBe(200);
    expect(updated.body.completion.note).toBe('3 litres');

    // A PUT without a note leaves the existing note alone.
    const untouched = await call(ctx, 'put', url(habit, '2026-10-28'));
    expect(untouched.body.completion.note).toBe('3 litres');
  });

  it('allows back-filling a past scheduled day', async () => {
    expect((await call(ctx, 'put', url(habit, '2026-10-01'))).status).toBe(201);
  });

  describe('rejected dates', () => {
    it('future date (in the user timezone) -> 422 DATE_NOT_COMPLETABLE / DATE_IN_FUTURE', async () => {
      const res = await call(ctx, 'put', url(habit, '2026-10-29'));
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        code: 'DATE_NOT_COMPLETABLE',
        message: 'Cannot complete a habit for a future date',
        details: { reason: 'DATE_IN_FUTURE', today: '2026-10-28' },
      });
      expect(await HabitCompletion.count()).toBe(0);
    });

    it('"today" is the user\'s: the 29th is already completable in Tokyo', async () => {
      // 16:00 UTC on the 28th is 01:00 on the 29th in Tokyo (UTC+9).
      const tokyo = await signup('Asia/Tokyo');
      const tokyoHabit = await createHabitViaApi(tokyo, { startDate: '2026-10-01' });
      expect((await call(tokyo, 'put', url(tokyoHabit, '2026-10-29'))).status).toBe(201);
    });

    it('before startDate -> 422 DATE_NOT_COMPLETABLE / BEFORE_START_DATE', async () => {
      const res = await call(ctx, 'put', url(habit, '2026-09-30'));
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        code: 'DATE_NOT_COMPLETABLE',
        details: { reason: 'BEFORE_START_DATE', startDate: '2026-10-01' },
      });
    });

    it('unscheduled weekday -> 422 DATE_NOT_SCHEDULED', async () => {
      const mwf = await createHabitViaApi(ctx, {
        name: 'Gym',
        frequencyType: 'weekdays',
        weekdays: [1, 3, 5],
        startDate: '2026-10-01',
      });
      const res = await call(ctx, 'put', url(mwf, '2026-10-27')); // Tuesday
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        code: 'DATE_NOT_SCHEDULED',
        details: { weekdays: [1, 3, 5] },
      });
      expect((await call(ctx, 'put', url(mwf, '2026-10-26'))).status).toBe(201); // Monday
    });

    it('weekly_target habits accept any day', async () => {
      const weekly = await createHabitViaApi(ctx, {
        name: 'Run',
        frequencyType: 'weekly_target',
        targetPerWeek: 2,
        startDate: '2026-10-01',
      });
      expect((await call(ctx, 'put', url(weekly, '2026-10-27'))).status).toBe(201);
    });

    it('archived habit -> 409 HABIT_ARCHIVED for PUT and DELETE (history is read-only)', async () => {
      await call(ctx, 'put', url(habit, '2026-10-27'));
      await call(ctx, 'post', `/api/v1/habits/${habit.id}/archive`);

      const put = await call(ctx, 'put', url(habit, '2026-10-28'));
      expect(put.status).toBe(409);
      expect(put.body.error.code).toBe('HABIT_ARCHIVED');
      const del = await call(ctx, 'delete', url(habit, '2026-10-27'));
      expect(del.status).toBe(409);
      expect(await HabitCompletion.count()).toBe(1);
    });

    it.each([['2026-10-32'], ['2026-02-29'], ['28-10-2026'], ['today']])(
      'malformed date %s -> 422 VALIDATION_ERROR',
      async (date) => {
        const res = await call(ctx, 'put', url(habit, date));
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details[0]).toMatchObject({ location: 'params', path: 'date' });
      },
    );

    it('a note over 280 characters -> 422', async () => {
      const res = await call(ctx, 'put', url(habit, '2026-10-28'), { note: 'x'.repeat(281) });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].path).toBe('note');
    });
  });
});

describe('DELETE /habits/:id/completions/:date', () => {
  it('removes the completion (204) and is idempotent', async () => {
    await call(ctx, 'put', url(habit, '2026-10-28'));

    expect((await call(ctx, 'delete', url(habit, '2026-10-28'))).status).toBe(204);
    expect(await HabitCompletion.count()).toBe(0);
    expect((await call(ctx, 'delete', url(habit, '2026-10-28'))).status).toBe(204);
  });

  it('undo recalculates the streak', async () => {
    for (const date of ['2026-10-26', '2026-10-27', '2026-10-28']) {
      await call(ctx, 'put', url(habit, date));
    }
    const before = await call(ctx, 'get', `/api/v1/habits/${habit.id}`);
    expect(before.body.streaks).toMatchObject({ current: 3, longest: 3, status: 'completed' });

    await call(ctx, 'delete', url(habit, '2026-10-27'));
    const after = await call(ctx, 'get', `/api/v1/habits/${habit.id}`);
    expect(after.body.streaks).toMatchObject({ current: 1, longest: 1, status: 'completed' });

    // Undoing today makes it pending again, which does not break the (now empty) streak.
    await call(ctx, 'delete', url(habit, '2026-10-28'));
    const pending = await call(ctx, 'get', `/api/v1/habits/${habit.id}`);
    expect(pending.body.streaks).toMatchObject({ current: 0, status: 'pending' });
  });

  it('only removes my own completion', async () => {
    await call(ctx, 'put', url(habit, '2026-10-28'));
    const other = await signup();
    // Another user can't even see the habit, so nothing of mine can be touched.
    expect((await call(other, 'delete', url(habit, '2026-10-28'))).status).toBe(404);
    expect(await HabitCompletion.count()).toBe(1);
  });
});

describe('authorization', () => {
  it("another user's habit -> 404 for PUT and DELETE, and no row is written", async () => {
    const other = await signup();
    const put = await call(other, 'put', url(habit, '2026-10-28'));
    expect(put.status).toBe(404);
    expect(put.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Habit not found' } });
    expect((await call(other, 'delete', url(habit, '2026-10-28'))).status).toBe(404);
    expect(await HabitCompletion.count()).toBe(0);
  });

  it('requires authentication and the CSRF header', async () => {
    expect((await request(app).put(url(habit, '2026-10-28'))).status).toBe(401);
    const noCsrf = await ctx.agent.put(url(habit, '2026-10-28'));
    expect(noCsrf.status).toBe(403);
    expect(
      (await request(app).get('/api/v1/completions?from=2026-10-01&to=2026-10-28')).status,
    ).toBe(401);
  });
});

describe('GET /completions', () => {
  const history = (query) => call(ctx, 'get', `/api/v1/completions?${query}`);

  it('lists my completions in the range, newest first, paginated', async () => {
    for (const date of ['2026-10-20', '2026-10-25', '2026-10-26', '2026-10-28']) {
      await call(ctx, 'put', url(habit, date));
    }
    const res = await history('from=2026-10-21&to=2026-10-28&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.completionDate)).toEqual(['2026-10-28', '2026-10-26']);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
  });

  it('filters by habitId and keeps archived habits in the history', async () => {
    const other = await createHabitViaApi(ctx, { name: 'Other', startDate: '2026-10-01' });
    await call(ctx, 'put', url(habit, '2026-10-27'));
    await call(ctx, 'put', url(other, '2026-10-27'));
    await call(ctx, 'post', `/api/v1/habits/${other.id}/archive`);

    const all = await history('from=2026-10-01&to=2026-10-28');
    expect(all.body.meta.total).toBe(2);
    const one = await history(`from=2026-10-01&to=2026-10-28&habitId=${other.id}`);
    expect(one.body.data.map((c) => c.habitId)).toEqual([other.id]);
  });

  it("never includes other users' completions, and their habitId is a 404", async () => {
    const other = await signup();
    const theirs = await createHabitViaApi(other, { startDate: '2026-10-01' });
    await call(other, 'put', url(theirs, '2026-10-28'));

    expect((await history('from=2026-10-01&to=2026-10-28')).body.meta.total).toBe(0);
    const res = await history(`from=2026-10-01&to=2026-10-28&habitId=${theirs.id}`);
    expect(res.status).toBe(404);
  });

  it.each([
    ['', 'from'],
    ['from=2026-10-01', 'to'],
    ['from=2026-10-28&to=2026-10-01', 'from'],
    ['from=2025-10-01&to=2026-10-02', 'to'], // 367 days
    ['from=2026-10-01&to=2026-10-28&habitId=nope', 'habitId'],
  ])('rejects ?%s with 422 (%s)', async (query, path) => {
    const res = await history(query);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ location: 'query', path })]),
    );
  });

  it('accepts a range of exactly 366 days', async () => {
    // Both ends count: Oct 28 2025 .. Oct 28 2026 is 365 days apart = 366 days in the range.
    expect((await history('from=2025-10-28&to=2026-10-28')).status).toBe(200);
    expect((await history('from=2025-10-27&to=2026-10-28')).status).toBe(422); // 367 days
  });
});
