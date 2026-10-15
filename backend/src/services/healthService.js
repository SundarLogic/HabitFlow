/**
 * Health service: the "business logic" behind GET /api/v1/health.
 *
 * Services hold the real logic of the app. They don't know about req/res (HTTP), which
 * means the same function could be reused from a cron job, a CLI script, or a test.
 */
import { logger } from '../config/logger.js';
import { now as systemNow } from '../utils/clock.js';

// Don't let a hanging database make the health endpoint hang too.
const DB_CHECK_TIMEOUT_MS = 2000;

/**
 * Runs `SELECT 1` against the database. Resolves if PostgreSQL answers within the timeout,
 * rejects (throws) otherwise.
 *
 * Promise.race([a, b]) settles with whichever promise finishes first:
 *   - query finishes first   -> success
 *   - timeout fires first    -> rejects with "Database check timed out"
 */
async function pingDatabase(db) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Database check timed out')), DB_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([db.query('SELECT 1', { raw: true }), timeout]);
  } finally {
    // Always cancel the timer, otherwise it would keep running after we're done.
    clearTimeout(timer);
  }
}

/**
 * Builds the health report.
 *
 * `status` is always 'ok': if this code runs, the API process is alive.
 * `db` tells whether PostgreSQL is reachable. A database problem is reported, not thrown,
 * so the endpoint still answers 200.
 *
 * @param {object} deps
 * @param {object} deps.db Sequelize instance (or a fake in tests) with a query() method
 * @param {() => Date} [deps.now] clock function; tests can pass a fixed time
 * @returns {Promise<{ status: 'ok', db: 'ok' | 'down', time: string }>}
 */
export async function getHealth({ db, now = systemNow }) {
  let dbStatus = 'ok';
  try {
    await pingDatabase(db);
  } catch (err) {
    dbStatus = 'down';
    // Log only safe fields (message + Postgres error code), never the full error object.
    logger.warn(
      { err: { message: err.message, code: err.parent?.code } },
      'Database health check failed',
    );
  }
  // toISOString() always produces UTC, e.g. "2026-10-15T06:36:52.431Z".
  return { status: 'ok', db: dbStatus, time: now().toISOString() };
}
