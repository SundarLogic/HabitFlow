/**
 * Health controller.
 *
 * Controllers are the "HTTP layer": they read the request, call ONE service function, and send
 * the response. They never talk to the database directly and contain no business rules; that
 * belongs in services. This keeps business logic testable without HTTP.
 */
import * as healthService from '../services/healthService.js';

/**
 * GET /api/v1/health
 * Response: 200 { status: 'ok', db: 'ok' | 'down', time: '<ISO timestamp>' }
 *
 * No try/catch needed: Express 5 forwards any error thrown here to the error handler.
 */
export async function getHealth(req, res) {
  // The db comes from app.locals (set in createApp) so tests can inject a fake one.
  const health = await healthService.getHealth({ db: req.app.locals.db });

  // no-store: tell browsers/proxies never to cache this; health must always be fresh.
  res.set('Cache-Control', 'no-store').json(health);
}
