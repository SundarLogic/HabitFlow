/**
 * Analytics controller: the HTTP layer for /analytics/* and GET /habits/:id/history.
 * The service returns plain JSON-ready objects (no model instances), so the controller only
 * passes validated input through and sends the result.
 */
import * as analyticsService from '../services/analyticsService.js';
import { now as systemNow } from '../utils/clock.js';

/** The app clock (tests inject a fixed one via createApp({ now })). */
const clock = (req) => req.app.locals.now ?? systemNow;

/** GET /analytics/summary?from&to&habitId&includeArchived */
export async function summary(req, res) {
  const result = await analyticsService.getSummary({
    workspace: req.workspace,
    user: req.user,
    ...req.query,
    now: clock(req),
  });
  res.set('Cache-Control', 'no-store').json(result);
}

/** GET /analytics/heatmap?year or ?from&to */
export async function heatmap(req, res) {
  const result = await analyticsService.getHeatmap({
    workspace: req.workspace,
    user: req.user,
    ...req.query,
    now: clock(req),
  });
  res.set('Cache-Control', 'no-store').json(result);
}

/** GET /habits/:id/history?from&to */
export async function habitHistory(req, res) {
  const result = await analyticsService.getHabitHistory({
    workspace: req.workspace,
    user: req.user,
    habitId: req.params.id,
    ...req.query,
    now: clock(req),
  });
  res.set('Cache-Control', 'no-store').json(result);
}
