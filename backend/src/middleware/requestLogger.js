/**
 * Request logging middleware (pino-http).
 *
 * For every request it writes one JSON log line when the response finishes, containing the
 * method, URL, status code, response time and a request id. Sensitive headers (cookies,
 * Authorization) are hidden by the redaction rules in config/logger.js.
 *
 * Request id: a unique id per request, returned to the client in the X-Request-Id response
 * header and included in every log line. If a user reports "request abc-123 failed", we can
 * search the logs for abc-123 and find exactly what happened.
 */
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';

// We reuse an incoming X-Request-Id (e.g. from a load balancer) only if it looks safe:
// letters, digits, dot, underscore, dash; 1-128 characters. Anything else could be used to
// inject junk into our logs, so we generate a fresh id instead.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * @param {import('pino').Logger} logger the app logger to write to
 * @returns {import('express').RequestHandler}
 */
export function requestLogger(logger) {
  return pinoHttp({
    logger,

    // Decide the id for this request and expose it to the client.
    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id =
        typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },

    // Choose the log level from the outcome so problems stand out:
    // 5xx (our bug / outage) = error, 4xx (client mistake) = warn, everything else = info.
    customLogLevel(req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
