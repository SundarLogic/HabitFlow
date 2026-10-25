/**
 * A small in-memory stand-in for the habit, completion and today endpoints, used by the MSW fake
 * API (server.js). It follows the real API's shapes (docs/API.md) and the main rules, closely
 * enough for UI tests: archived habits leave Today, ticking a habit completes it, weekdays habits
 * only appear on their days, and so on. It is NOT a second implementation of the streak engine:
 * streaks are reported as 0 unless a test sets them.
 *
 *   db.habits.push(makeHabit({ name: 'Read', frequencyType: 'weekdays', weekdays: [1,3,5] }));
 */
import { DateTime } from 'luxon';
import { HttpResponse, http } from 'msw';

/**
 * "Today" the same way the app computes it: the test user's timezone (ME.user.timezone), so the
 * fake and the UI always agree on which day it is.
 */
export const fakeToday = () => DateTime.now().setZone('America/New_York').toISODate();

export const db = { habits: [], completions: new Set(), nextId: 1 };

export function resetDb() {
  db.habits = [];
  db.completions = new Set();
  db.nextId = 1;
}

/** A complete habit object as the API returns it. */
export function makeHabit(overrides = {}) {
  const id = overrides.id ?? `00000000-0000-4000-8000-${String(db.nextId++).padStart(12, '0')}`;
  return {
    id,
    workspaceId: 'cc15dd7f-0000-4000-8000-000000000002',
    createdBy: '3a2fad36-0000-4000-8000-000000000001',
    name: 'Habit',
    description: null,
    category: null,
    color: '#4F46E5',
    icon: null,
    frequencyType: 'daily',
    weekdays: null,
    targetPerWeek: null,
    startDate: DateTime.fromISO(fakeToday()).minus({ days: 30 }).toISODate(),
    status: 'active',
    archivedAt: null,
    sortOrder: db.habits.length,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

const key = (habitId, date) => `${habitId}|${date}`;
const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Habit not found' } }, { status: 404 });

function isScheduled(habit, date) {
  if (date < habit.startDate) return false;
  if (habit.frequencyType !== 'weekdays') return true;
  return habit.weekdays.includes(DateTime.fromISO(date).weekday);
}

function weekCount(habit, date) {
  const start = DateTime.fromISO(date).startOf('week');
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    if (db.completions.has(key(habit.id, start.plus({ days: i }).toISODate()))) count += 1;
  }
  return count;
}

/** One GET /today item. */
function todayItem(habit, date) {
  const completed = db.completions.has(key(habit.id, date));
  const item = {
    habit,
    completed,
    completion: completed
      ? {
          id: `c-${habit.id}-${date}`,
          habitId: habit.id,
          completedBy: 'u',
          completionDate: date,
          completedAt: `${date}T12:00:00.000Z`,
          note: null,
        }
      : null,
    status: completed
      ? 'completed'
      : date === fakeToday()
        ? 'pending'
        : date < fakeToday()
          ? 'missed'
          : 'upcoming',
    isDue: false,
    streak: {
      current: 0,
      longest: 0,
      unit: habit.frequencyType === 'weekly_target' ? 'weeks' : 'days',
    },
  };
  if (habit.frequencyType === 'weekly_target') {
    const done = weekCount(habit, date);
    item.weekProgress = { done, target: habit.targetPerWeek };
    if (!completed && done >= habit.targetPerWeek && date <= fakeToday()) item.status = 'completed';
  }
  return item;
}

const active = () => db.habits.filter((h) => h.status === 'active');

export const habitHandlers = [
  http.get('/api/v1/habits/categories', () =>
    HttpResponse.json({
      data: [...new Set(db.habits.map((h) => h.category).filter(Boolean))].sort(),
    }),
  ),
  http.get('/api/v1/habits', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status') ?? 'active';
    const search = params.get('search')?.toLowerCase();
    const category = params.get('category');
    const data = db.habits
      .filter((h) => status === 'all' || h.status === status)
      .filter((h) => !search || h.name.toLowerCase().includes(search))
      .filter((h) => !category || h.category === category)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return HttpResponse.json({ data, meta: { page: 1, limit: 100, total: data.length } });
  }),
  http.post('/api/v1/habits', async ({ request }) => {
    const body = await request.json();
    const habit = makeHabit({ ...body, startDate: body.startDate ?? fakeToday() });
    db.habits.push(habit);
    return HttpResponse.json({ habit }, { status: 201 });
  }),
  http.patch('/api/v1/habits/reorder', async ({ request }) => {
    const { items } = await request.json();
    for (const { id, sortOrder } of items) {
      const habit = db.habits.find((h) => h.id === id);
      if (habit) habit.sortOrder = sortOrder;
    }
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch('/api/v1/habits/:id', async ({ params, request }) => {
    const habit = db.habits.find((h) => h.id === params.id);
    if (!habit) return notFound();
    Object.assign(habit, await request.json());
    return HttpResponse.json({ habit });
  }),
  http.post('/api/v1/habits/:id/archive', ({ params }) => {
    const habit = db.habits.find((h) => h.id === params.id);
    if (!habit) return notFound();
    Object.assign(habit, { status: 'archived', archivedAt: `${fakeToday()}T12:00:00.000Z` });
    return HttpResponse.json({ habit });
  }),
  http.post('/api/v1/habits/:id/unarchive', ({ params }) => {
    const habit = db.habits.find((h) => h.id === params.id);
    if (!habit) return notFound();
    Object.assign(habit, { status: 'active', archivedAt: null });
    return HttpResponse.json({ habit });
  }),
  http.delete('/api/v1/habits/:id', ({ params }) => {
    db.habits = db.habits.filter((h) => h.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/v1/habits/:id/reminders', () => HttpResponse.json({ data: [] })),
  http.post('/api/v1/habits/:id/reminders', async ({ params, request }) => {
    const { remindAt } = await request.json();
    return HttpResponse.json(
      {
        reminder: {
          id: `r-${params.id}-${remindAt}`,
          habitId: params.id,
          remindAt,
          weekdays: null,
          enabled: true,
        },
      },
      { status: 201 },
    );
  }),
  http.put('/api/v1/habits/:id/completions/:date', ({ params }) => {
    const created = !db.completions.has(key(params.id, params.date));
    db.completions.add(key(params.id, params.date));
    return HttpResponse.json(
      { completion: { id: 'c', habitId: params.id, completionDate: params.date, note: null } },
      { status: created ? 201 : 200 },
    );
  }),
  http.delete('/api/v1/habits/:id/completions/:date', ({ params }) => {
    db.completions.delete(key(params.id, params.date));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/v1/today', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date') ?? fakeToday();
    const habits = active()
      .filter((h) => isScheduled(h, date))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((h) => todayItem(h, date));
    const completed = habits.filter((h) => h.status === 'completed').length;
    return HttpResponse.json({
      date,
      today: fakeToday(),
      habits,
      summary: {
        scheduled: habits.length,
        completed,
        remaining: habits.filter((h) => h.status === 'pending').length,
        percent: habits.length ? Math.round((completed / habits.length) * 100) : null,
      },
    });
  }),
  http.get('/api/v1/analytics/summary', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const from = DateTime.fromISO(params.get('from'));
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: from.plus({ days: i }).toISODate(),
      scheduled: 0,
      completed: 0,
      rate: null,
    }));
    return HttpResponse.json({ range: { from: params.get('from'), to: params.get('to') }, daily });
  }),
];
