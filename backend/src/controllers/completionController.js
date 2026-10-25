/**
 * Completion controller: the HTTP layer for marking habits done, completion history and the
 * daily overview (/today). Middleware has set req.user and req.workspace; inputs are validated.
 */
import { toPublicCompletion } from '../serializers/completion.js';
import { toPublicHabit } from '../serializers/habit.js';
import * as completionService from '../services/completionService.js';
import * as todayService from '../services/todayService.js';
import { now as systemNow } from '../utils/clock.js';

/** The app clock (tests inject a fixed one via createApp({ now })). */
const clock = (req) => req.app.locals.now ?? systemNow;

/**
 * PUT /habits/:id/completions/:date { note? }
 * -> 201 { completion } when newly created, 200 { completion } when it already existed.
 */
export async function mark(req, res) {
  const { completion, created } = await completionService.markCompletion({
    workspace: req.workspace,
    user: req.user,
    habitId: req.params.id,
    date: req.params.date,
    note: req.body.note,
    now: clock(req),
  });
  res.status(created ? 201 : 200).json({ completion: toPublicCompletion(completion) });
}

/** DELETE /habits/:id/completions/:date -> 204, whether or not a completion existed */
export async function unmark(req, res) {
  await completionService.unmarkCompletion({
    workspace: req.workspace,
    user: req.user,
    habitId: req.params.id,
    date: req.params.date,
  });
  res.status(204).end();
}

/** GET /completions?from&to&habitId&page&limit -> { data, meta } */
export async function history(req, res) {
  const { page, limit } = req.query;
  const { completions, total } = await completionService.listHistory({
    workspace: req.workspace,
    user: req.user,
    ...req.query,
  });
  res.json({ data: completions.map(toPublicCompletion), meta: { page, limit, total } });
}

/** GET /today?date -> { date, today, habits: [...], summary } */
export async function today(req, res) {
  const overview = await todayService.getDayOverview({
    workspace: req.workspace,
    user: req.user,
    date: req.query.date,
    now: clock(req),
  });
  res.set('Cache-Control', 'no-store').json({
    date: overview.date,
    today: overview.today,
    habits: overview.items.map((item) => ({
      ...item,
      habit: toPublicHabit(item.habit),
      completion: item.completion ? toPublicCompletion(item.completion) : null,
    })),
    summary: overview.summary,
  });
}
