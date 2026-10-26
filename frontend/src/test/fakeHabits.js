/**
 * A small in-memory stand-in for the habit, completion, today, reminder and analytics endpoints,
 * used by the MSW fake API (server.js). It follows the real API's shapes (docs/API.md) and the
 * main rules, closely enough for UI tests: archived habits leave Today, ticking a habit completes
 * it, weekdays habits only appear on their days, today counts in rates only once done, and so on.
 * It is NOT a second implementation of the streak engine: streaks are 0 unless a test sets them
 * (db.streaks), and weekly_target habits are counted like daily ones in analytics.
 *
 *   db.habits.push(makeHabit({ name: 'Read', frequencyType: 'weekdays', weekdays: [1,3,5] }));
 *   db.completions.add(`${habit.id}|2026-10-20`);
 */
import { DateTime } from 'luxon';
import { HttpResponse, http } from 'msw';

/**
 * "Today" the same way the app computes it: the test user's timezone (ME.user.timezone), so the
 * fake and the UI always agree on which day it is.
 */
export const fakeToday = () => DateTime.now().setZone('America/New_York').toISODate();

/**
 * completions: 'habitId|date' keys; notes: same key -> note; reminders: API reminder objects;
 * streaks: habitId -> { current, longest } for tests that need non-zero streaks.
 */
export const db = {
  habits: [],
  completions: new Set(),
  notes: new Map(),
  reminders: [],
  streaks: new Map(),
  nextId: 1,
};

export function resetDb() {
  db.habits = [];
  db.completions = new Set();
  db.notes = new Map();
  db.reminders = [];
  db.streaks = new Map();
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

export const key = (habitId, date) => `${habitId}|${date}`;
const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Habit not found' } }, { status: 404 });
const active = () => db.habits.filter((h) => h.status === 'active');
const unitOf = (habit) => (habit.frequencyType === 'weekly_target' ? 'weeks' : 'days');

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

/** Every date from..to (inclusive). */
function eachDay(from, to) {
  const days = [];
  for (let d = DateTime.fromISO(from); d.toISODate() <= to; d = d.plus({ days: 1 })) {
    days.push(d.toISODate());
  }
  return days;
}

/** A completion object as the API returns it. */
function completionOf(habitId, date) {
  return {
    id: `c-${habitId}-${date}`,
    habitId,
    completedBy: '3a2fad36-0000-4000-8000-000000000001',
    completionDate: date,
    completedAt: `${date}T12:00:00.000Z`,
    note: db.notes.get(key(habitId, date)) ?? null,
  };
}

/** Analytics counts for one day: scheduled days up to today, and today only once it is done. */
function dayCounts(habits, date) {
  let scheduled = 0;
  let completed = 0;
  for (const habit of habits) {
    if (date > fakeToday() || !isScheduled(habit, date)) continue;
    const done = db.completions.has(key(habit.id, date));
    if (date === fakeToday() && !done) continue;
    scheduled += 1;
    if (done) completed += 1;
  }
  return { scheduled, completed };
}

const rateOf = ({ scheduled, completed }) =>
  scheduled === 0 ? null : Math.round((completed / scheduled) * 10000) / 10000;

const sum = (rows) =>
  rows.reduce(
    (total, row) => ({
      scheduled: total.scheduled + row.scheduled,
      completed: total.completed + row.completed,
    }),
    { scheduled: 0, completed: 0 },
  );

/** One GET /today item. */
function todayItem(habit, date) {
  const completed = db.completions.has(key(habit.id, date));
  const item = {
    habit,
    completed,
    completion: completed ? completionOf(habit.id, date) : null,
    status: completed
      ? 'completed'
      : date === fakeToday()
        ? 'pending'
        : date < fakeToday()
          ? 'missed'
          : 'upcoming',
    isDue: false,
    streak: { current: 0, longest: 0, unit: unitOf(habit) },
  };
  if (habit.frequencyType === 'weekly_target') {
    const done = weekCount(habit, date);
    item.weekProgress = { done, target: habit.targetPerWeek };
    if (!completed && done >= habit.targetPerWeek && date <= fakeToday()) item.status = 'completed';
  }
  return item;
}

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
  http.get('/api/v1/habits/:id', ({ params }) => {
    const habit = db.habits.find((h) => h.id === params.id);
    if (!habit) return notFound();
    const streak = db.streaks.get(habit.id) ?? { current: 0, longest: 0 };
    return HttpResponse.json({
      habit,
      streaks: { ...streak, unit: unitOf(habit), status: 'pending' },
    });
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
  http.get('/api/v1/habits/:id/history', ({ params, request }) => {
    const habit = db.habits.find((h) => h.id === params.id);
    if (!habit) return notFound();
    const search = new URL(request.url).searchParams;
    const from = search.get('from');
    const to = search.get('to');
    const data = eachDay(from, to).map((date) => {
      const completed = db.completions.has(key(habit.id, date));
      let status = 'not_scheduled';
      if (completed) status = 'completed';
      else if (date > fakeToday()) status = 'upcoming';
      else if (isScheduled(habit, date)) status = date === fakeToday() ? 'pending' : 'missed';
      return { date, status, completed };
    });
    return HttpResponse.json({ habitId: habit.id, range: { from, to }, data });
  }),
  http.get('/api/v1/habits/:id/reminders', ({ params }) =>
    HttpResponse.json({ data: db.reminders.filter((r) => r.habitId === params.id) }),
  ),
  http.post('/api/v1/habits/:id/reminders', async ({ params, request }) => {
    const { remindAt } = await request.json();
    const reminder = {
      id: `r-${params.id}-${remindAt}`,
      habitId: params.id,
      remindAt,
      weekdays: null,
      enabled: true,
    };
    db.reminders.push(reminder);
    return HttpResponse.json({ reminder }, { status: 201 });
  }),
  http.patch('/api/v1/reminders/:id', async ({ params, request }) => {
    const reminder = db.reminders.find((r) => r.id === params.id);
    if (!reminder) return notFound();
    Object.assign(reminder, await request.json());
    return HttpResponse.json({ reminder });
  }),
  http.delete('/api/v1/reminders/:id', ({ params }) => {
    db.reminders = db.reminders.filter((r) => r.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put('/api/v1/habits/:id/completions/:date', async ({ params, request }) => {
    const k = key(params.id, params.date);
    const created = !db.completions.has(k);
    db.completions.add(k);
    // The body is optional ({ note } only when saving a note).
    const text = await request.text();
    const body = text ? JSON.parse(text) : {};
    if (body.note !== undefined) db.notes.set(k, body.note);
    return HttpResponse.json(
      { completion: completionOf(params.id, params.date) },
      { status: created ? 201 : 200 },
    );
  }),
  http.delete('/api/v1/habits/:id/completions/:date', ({ params }) => {
    db.completions.delete(key(params.id, params.date));
    db.notes.delete(key(params.id, params.date));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/v1/completions', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const from = search.get('from');
    const to = search.get('to');
    const page = Number(search.get('page') ?? 1);
    const limit = Number(search.get('limit') ?? 20);
    const habitId = search.get('habitId');
    const all = [...db.completions]
      .map((k) => k.split('|'))
      .filter(([id, date]) => (!habitId || id === habitId) && date >= from && date <= to)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([id, date]) => completionOf(id, date));
    return HttpResponse.json({
      data: all.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: all.length },
    });
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
    const search = new URL(request.url).searchParams;
    const from = search.get('from');
    const to = search.get('to');
    const habitId = search.get('habitId');
    const habits = db.habits.filter((h) => !habitId || h.id === habitId);
    const daily = eachDay(from, to).map((date) => {
      const counts = dayCounts(habits, date);
      return { date, ...counts, rate: rateOf(counts) };
    });
    const overall = sum(daily);
    const weeks = new Map();
    for (const day of daily) {
      const weekStart = DateTime.fromISO(day.date).startOf('week').toISODate();
      weeks.set(weekStart, [...(weeks.get(weekStart) ?? []), day]);
    }
    const byHabit = habits.map((habit) => {
      const counts = sum(eachDay(from, to).map((date) => dayCounts([habit], date)));
      const streak = db.streaks.get(habit.id) ?? { current: 0, longest: 0 };
      return {
        habitId: habit.id,
        name: habit.name,
        category: habit.category,
        status: habit.status,
        completionRate: rateOf(counts),
        ...counts,
        currentStreak: streak.current,
        longestStreak: streak.longest,
        unit: unitOf(habit),
      };
    });
    const categoryOf = (h) => h.category ?? 'Uncategorized';
    const categories = [...new Set(habits.map(categoryOf))];
    const dueToday = active().filter((h) => isScheduled(h, fakeToday()));
    const doneToday = dueToday.filter((h) => db.completions.has(key(h.id, fakeToday()))).length;
    return HttpResponse.json({
      range: { from, to },
      today: {
        scheduled: dueToday.length,
        completed: doneToday,
        remaining: dueToday.length - doneToday,
        percent: dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : null,
      },
      overall: { completionRate: rateOf(overall), ...overall },
      bestStreak: null,
      daily,
      weekly: [...weeks].map(([weekStart, days]) => {
        const counts = sum(days);
        return { weekStart, ...counts, rate: rateOf(counts) };
      }),
      byHabit,
      byCategory: categories.map((category) => {
        const counts = sum(byHabit.filter((h) => categoryOf(h) === category));
        return { category, completionRate: rateOf(counts), ...counts };
      }),
    });
  }),
  http.get('/api/v1/analytics/heatmap', ({ request }) => {
    const search = new URL(request.url).searchParams;
    const from = search.get('from');
    const to = search.get('to');
    return HttpResponse.json({
      range: { from, to },
      data: eachDay(from, to).map((date) => ({ date, ...dayCounts(active(), date) })),
    });
  }),
];
