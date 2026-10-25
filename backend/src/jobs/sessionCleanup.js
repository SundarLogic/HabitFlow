/**
 * Session cleanup job: deletes expired sessions so the table doesn't grow forever.
 *
 * Expired sessions are already rejected (and deleted) when someone tries to use them; this job
 * removes the ones nobody comes back with. It will be scheduled nightly with node-cron in
 * Phase 7; until then it can be called directly (tests do).
 */
import { logger as defaultLogger } from '../config/logger.js';
import { purgeExpiredSessions } from '../services/authService.js';
import { now as systemNow } from '../utils/clock.js';

/**
 * Runs one cleanup pass.
 * @param {{ now?: () => Date, logger?: import('pino').Logger }} [deps]
 * @returns {Promise<number>} how many sessions were deleted
 */
export async function runSessionCleanup({ now = systemNow, logger = defaultLogger } = {}) {
  const deleted = await purgeExpiredSessions({ now });
  logger.info({ job: 'session-cleanup', deleted }, 'Expired sessions purged');
  return deleted;
}
