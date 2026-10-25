/**
 * Reminder scheduler: once a minute, sends every reminder that is due now.
 *
 *   runReminderTick({ now })     one tick; tests call it directly with a fake clock
 *   startReminderScheduler(...)  the node-cron schedule, started ONLY by server.js (via
 *                                jobs/index.js), never by app.js, so tests never start it
 *
 * Safe to run on several servers at once: notifications are de-duplicated by the database
 * (see services/reminderDispatchService.js).
 */
import cron from 'node-cron';
import { logger as defaultLogger } from '../config/logger.js';
import { dispatchDueReminders } from '../services/reminderDispatchService.js';
import { now as systemNow } from '../utils/clock.js';

/**
 * One tick. Never throws: a failure is logged and the next minute tries again.
 * @param {{ now?: () => Date, logger?: import('pino').Logger }} [deps]
 * @returns {Promise<object | null>} the dispatch result, or null if the tick failed
 */
export async function runReminderTick({ now = systemNow, logger = defaultLogger } = {}) {
  try {
    const result = await dispatchDueReminders({ now, logger });
    if (result.considered > 0) logger.info({ job: 'reminders', ...result }, 'Reminder tick');
    return result;
  } catch (err) {
    logger.error({ err, job: 'reminders' }, 'Reminder tick failed');
    return null;
  }
}

/**
 * Schedules runReminderTick at the start of every minute.
 * noOverlap: if a tick is still running a minute later, the next one is skipped, not stacked.
 * @param {{ logger?: import('pino').Logger }} [deps]
 * @returns {import('node-cron').ScheduledTask}
 */
export function startReminderScheduler({ logger = defaultLogger } = {}) {
  return cron.schedule('* * * * *', () => runReminderTick({ logger }), {
    name: 'reminders',
    noOverlap: true,
  });
}
