/**
 * Error tracking, Sentry-ready (ADR-058). Off unless SENTRY_DSN is set.
 *
 *   server.js       await initErrorTracking({ logger })     once, at startup
 *   errorHandler    captureError(err, { requestId, userId, method, route })  for every 500
 *   server.js       captureError + flushErrorTracking() before exiting on a crash
 *
 * @sentry/node is NOT a dependency: to switch it on, `npm install @sentry/node` and set
 * SENTRY_DSN. Until then every function here is a cheap no-op. A different provider can be
 * plugged in the same way (setErrorTrackingClient), so the rest of the code never changes.
 *
 * Privacy (PII scrubbing): scrubEvent() runs on every event before it leaves the server. It
 * drops cookies, auth and CSRF headers, request bodies (passwords, notes), query strings, IP
 * addresses and every user field except the id.
 */
import { env } from '../config/env.js';

/** The active client (Sentry or a test double), or null when error tracking is off. */
let client = null;

const SENSITIVE_HEADERS = new Set(['cookie', 'authorization', 'x-csrf-token', 'set-cookie']);

/**
 * Removes personal and secret data from a Sentry-style event. Pure; returns the same object.
 * @param {object} event
 * @returns {object}
 */
export function scrubEvent(event) {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(
          ([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
    if (typeof event.request.url === 'string') event.request.url = event.request.url.split('?')[0];
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  return event;
}

/** Plugs in a client (Sentry's module, or a fake in tests); null switches tracking off. */
export function setErrorTrackingClient(next) {
  client = next;
}

/**
 * Starts Sentry when SENTRY_DSN is set. Never throws: a missing package only logs a warning.
 * @param {{ logger: import('pino').Logger, dsn?: string }} options
 * @returns {Promise<boolean>} whether error tracking is on
 */
export async function initErrorTracking({ logger, dsn = env.SENTRY_DSN }) {
  if (!dsn) return false;
  try {
    // A variable specifier keeps bundlers and linters from requiring the optional package.
    const packageName = '@sentry/node';
    const Sentry = await import(packageName);
    Sentry.init({
      dsn,
      environment: env.NODE_ENV,
      sendDefaultPii: false, // never attach IPs, cookies or bodies automatically
      beforeSend: scrubEvent,
    });
    setErrorTrackingClient(Sentry);
    logger.info('Error tracking enabled');
    return true;
  } catch (err) {
    logger.warn(
      { err: { message: err.message } },
      'SENTRY_DSN is set but @sentry/node could not be loaded (run: npm install @sentry/node)',
    );
    return false;
  }
}

/**
 * Reports an unexpected error with non-personal context. No-op when tracking is off.
 * @param {unknown} err
 * @param {{ requestId?: string, userId?: string, method?: string, route?: string }} [context]
 */
export function captureError(err, context = {}) {
  if (!client) return;
  client.withScope((scope) => {
    if (context.requestId) scope.setTag('requestId', context.requestId);
    if (context.method) scope.setTag('method', context.method);
    if (context.route) scope.setTag('route', context.route);
    if (context.userId) scope.setUser({ id: context.userId }); // the id only, never the email
    client.captureException(err);
  });
}

/**
 * Waits (up to timeoutMs) for queued events to be sent; used before the process exits.
 * @param {number} [timeoutMs]
 */
export async function flushErrorTracking(timeoutMs = 2000) {
  if (client?.flush) await client.flush(timeoutMs);
}
