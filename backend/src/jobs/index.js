/**
 * Starts the background jobs. Called by server.js ONLY (never by app.js), so tests, which build
 * apps with createApp(), never start timers.
 *
 *   reminders     every minute
 *   housekeeping  daily (expired sessions, old notifications)
 * Both run only when RUN_SCHEDULER=true (the default) and never under NODE_ENV=test. With several
 * API instances, set RUN_SCHEDULER=false on all but one (ADR-057); notification dedupe keys make
 * an accidental double run harmless, but it would still double the database work.
 */
import { env } from '../config/env.js';
import { logger as defaultLogger } from '../config/logger.js';
import { startHousekeeping } from './housekeeping.js';
import { startReminderScheduler } from './reminderScheduler.js';

/**
 * @param {{ logger?: import('pino').Logger }} [deps]
 * @returns {() => Promise<void>} stops every started job (used by graceful shutdown)
 */
export function startJobs({ logger = defaultLogger } = {}) {
  const tasks = [];
  if (env.NODE_ENV !== 'test' && env.RUN_SCHEDULER) {
    tasks.push(startHousekeeping({ logger }));
    tasks.push(startReminderScheduler({ logger }));
  }
  logger.info(
    { jobs: tasks.map((task) => task.name), runScheduler: env.RUN_SCHEDULER },
    'Background jobs started',
  );
  return async () => {
    for (const task of tasks) await task.stop();
  };
}
