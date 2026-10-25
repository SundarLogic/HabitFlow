/**
 * Habit controller: the HTTP layer for /api/v1/habits.
 *
 * By the time a handler runs, the middleware has set req.user, req.workspace (the active
 * workspace every habit query is scoped to) and the validated req.params / req.query / req.body.
 */
import { toPublicHabit } from '../serializers/habit.js';
import * as habitService from '../services/habitService.js';
import { now as systemNow } from '../utils/clock.js';

/** The app clock (tests inject a fixed one via createApp({ now })). */
const clock = (req) => req.app.locals.now ?? systemNow;

/** GET /habits?status&category&search&page&limit -> { data, meta } */
export async function list(req, res) {
  const { page, limit } = req.query;
  const { habits, total } = await habitService.listHabits(req.workspace.id, req.query);
  res.json({ data: habits.map(toPublicHabit), meta: { page, limit, total } });
}

/** GET /habits/categories -> { data: ['Fitness', ...] } */
export async function categories(req, res) {
  const data = await habitService.listCategories(req.workspace.id);
  res.json({ data });
}

/**
 * GET /habits/:id -> { habit, streaks: { current, longest, unit, status, weekProgress? } }
 * streaks are the requesting user's, as of today in their timezone.
 */
export async function get(req, res) {
  const { habit, streak } = await habitService.getHabitDetail(req.workspace.id, req.params.id, {
    user: req.user,
    now: clock(req),
  });
  res.json({ habit: toPublicHabit(habit), streaks: streak });
}

/** POST /habits -> 201 { habit } */
export async function create(req, res) {
  const habit = await habitService.createHabit({
    workspace: req.workspace,
    user: req.user,
    input: req.body,
    now: clock(req),
  });
  res.status(201).json({ habit: toPublicHabit(habit) });
}

/** PATCH /habits/:id -> { habit } */
export async function update(req, res) {
  const habit = await habitService.updateHabit({
    workspace: req.workspace,
    user: req.user,
    id: req.params.id,
    changes: req.body,
    now: clock(req),
  });
  res.json({ habit: toPublicHabit(habit) });
}

/** POST /habits/:id/archive -> { habit } */
export async function archive(req, res) {
  const habit = await habitService.archiveHabit({
    workspace: req.workspace,
    id: req.params.id,
    now: clock(req),
  });
  res.json({ habit: toPublicHabit(habit) });
}

/** POST /habits/:id/unarchive -> { habit } */
export async function unarchive(req, res) {
  const habit = await habitService.unarchiveHabit({ workspace: req.workspace, id: req.params.id });
  res.json({ habit: toPublicHabit(habit) });
}

/** DELETE /habits/:id?permanent=true|false -> 204 */
export async function remove(req, res) {
  await habitService.removeHabit({
    workspace: req.workspace,
    id: req.params.id,
    permanent: req.query.permanent,
    now: clock(req),
  });
  res.status(204).end();
}

/** PATCH /habits/reorder { items: [{ id, sortOrder }] } -> 204 */
export async function reorder(req, res) {
  await habitService.reorderHabits({ workspace: req.workspace, items: req.body.items });
  res.status(204).end();
}
