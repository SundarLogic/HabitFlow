/**
 * Daily housekeeping (CLAUDE.md §3.1 retention policy):
 *   - delete expired sessions (they are already rejected on use; this keeps the table small);
 *   - delete notifications older than 90 days.
 *
 *   runHousekeeping({ now })  one run; tests call it directly with a fake clock
 *   startHousekeeping(...)    the node-cron schedule (03:15 UTC daily), started by server.js only
 */
import cron from 'node-cron';
import { logger as defaultLogger } from '../config/logger.js';
import { purgeExpiredSessions } from '../services/authService.js';
import { purgeOldNotifications } from '../services/notificationService.js';
import { now as systemNow } from '../utils/clock.js';

/**
 * @param {{ now?: () => Date, logger?: import('pino').Logger }} [deps]
 * @returns {Promise<{ sessions: number, notifications: number }>} rows deleted
 */
export async function runHousekeeping({ now = systemNow, logger = defaultLogger } = {}) {
  const sessions = await purgeExpiredSessions({ now });
  const notifications = await purgeOldNotifications({ now });
  logger.info({ job: 'housekeeping', sessions, notifications }, 'Housekeeping done');
  return { sessions, notifications };
}

/**
 * Runs housekeeping every day at 03:15 UTC (a quiet hour for most users). Errors are logged;
 * tomorrow's run tries again.
 * @param {{ logger?: import('pino').Logger }} [deps]
 * @returns {import('node-cron').ScheduledTask}
 */
export function startHousekeeping({ logger = defaultLogger } = {}) {
  return cron.schedule(
    '15 3 * * *',
    async () => {
      try {
        await runHousekeeping({ logger });
      } catch (err) {
        logger.error({ err, job: 'housekeeping' }, 'Housekeeping failed');
      }
    },
    { name: 'housekeeping', timezone: 'UTC', noOverlap: true },
  );
}
