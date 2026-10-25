/**
 * Starts the background jobs. Called by server.js ONLY (never by app.js), so tests, which build
 * apps with createApp(), never start timers.
 *
 *   reminders     every minute; off when NODE_ENV=test or REMINDERS_ENABLED=false
 *   housekeeping  daily; off when NODE_ENV=test
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
  if (env.NODE_ENV !== 'test') {
    tasks.push(startHousekeeping({ logger }));
    if (env.REMINDERS_ENABLED) tasks.push(startReminderScheduler({ logger }));
  }
  logger.info(
    { jobs: tasks.map((task) => task.name), remindersEnabled: env.REMINDERS_ENABLED },
    'Background jobs started',
  );
  return async () => {
    for (const task of tasks) await task.stop();
  };
}
