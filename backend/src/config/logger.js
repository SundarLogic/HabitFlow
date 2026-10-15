/**
 * logger.js — the application logger (pino).
 *
 * pino writes one JSON object per line, e.g.
 *   {"level":30,"time":"2026-10-15T06:36:52.269Z","service":"habitflow-api","msg":"HabitFlow API listening"}
 * JSON logs are easy for log tools to search and filter. Level numbers: 30 = info,
 * 40 = warn, 50 = error, 60 = fatal.
 *
 * Usage:
 *   import { logger } from '../config/logger.js';
 *   logger.info({ habitId }, 'Habit archived');   // object first (extra data), message second
 *   logger.error({ err }, 'Failed to send reminder');
 *
 * Rule: never use console.log in app code (ESLint enforces this). Use the logger.
 */
import pino from 'pino';
import { env } from './env.js';

/**
 * Fields that must NEVER appear in logs: passwords, tokens, cookies, and SQL text (which can
 * contain user data). pino replaces their values with "[REDACTED]".
 *
 * Path syntax: 'req.headers.cookie' = that exact field;
 * '*.password' = a `password` field one level deep in any object (e.g. body.password);
 * '*.*.password' = two levels deep (e.g. req.body.password).
 * When you add a new sensitive field name, add it here and to tests/unit/logger.test.js.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'token',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.tokenHash',
  '*.token_hash',
  '*.sessionToken',
  '*.csrfToken',
  '*.*.password',
  '*.*.token',
  'err.sql',
  'err.parameters',
  'err.original.sql',
  'err.original.parameters',
  'err.parent.sql',
  'err.parent.parameters',
];

/**
 * Creates a pino logger. The app uses the shared `logger` below; tests call createLogger()
 * with a custom `destination` stream to capture and inspect the output.
 *
 * @param {object} [options]
 * @param {string} [options.level] minimum level to log (default: LOG_LEVEL from .env)
 * @param {import('node:stream').Writable} [options.destination] where to write (default: stdout)
 */
export function createLogger({ level = env.LOG_LEVEL, destination } = {}) {
  return pino(
    {
      level,
      base: { service: 'habitflow-api' }, // added to every log line
      timestamp: pino.stdTimeFunctions.isoTime, // human-readable UTC time instead of epoch ms
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    destination,
  );
}

// The shared logger used throughout the app.
export const logger = createLogger();
