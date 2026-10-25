/**
 * Rate limiting: limits how many requests one client can make in a time window.
 *
 *   createRateLimiter      per IP. app.js uses it for everything under /api (300 / 15 min).
 *   createAuthRateLimiter  per IP + email, for login and signup (10 / 15 min). Keying on the email
 *                          too means one attacker can't lock out everyone behind the same IP
 *                          (an office, a mobile carrier), while one email can't be
 *                          brute-forced from a single IP.
 *
 * Limiters keep their counters in memory, inside the limiter object. createApp() builds new
 * ones for every app, so tests don't share counters. (With several server instances, a shared
 * store such as Redis would be needed; not in first-release scope.)
 */
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RateLimitedError } from '../utils/AppError.js';

/**
 * @param {object} options
 * @param {number} options.windowMs length of the time window in milliseconds
 * @param {number} options.limit max requests allowed per client within that window
 * @param {(req: import('express').Request) => string} [options.keyGenerator] how to identify
 *   a client (default: by IP address)
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    ...(keyGenerator ? { keyGenerator } : {}),
    // Send the modern standard `RateLimit` header so clients know their remaining quota...
    standardHeaders: 'draft-8',
    // ...and skip the older non-standard X-RateLimit-* headers.
    legacyHeaders: false,
    // When the limit is exceeded, hand a RateLimitedError (429) to our central error handler
    // so the response uses the same JSON error format as every other error.
    handler(req, res, next) {
      next(new RateLimitedError());
    },
  });
}

/**
 * Limiter for login/signup, keyed by IP + the (normalised) email in the body.
 * express.json() has already parsed the body when this runs; validation has not, so the email
 * is normalised here the same way the validator will do it.
 *
 * @param {{ windowMs: number, limit: number }} options
 * @returns {import('express').RequestHandler}
 */
export function createAuthRateLimiter({ windowMs, limit }) {
  return createRateLimiter({
    windowMs,
    limit,
    keyGenerator(req) {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      // ipKeyGenerator groups an IPv6 address with its /56 subnet: one IPv6 user can own
      // millions of addresses, so counting each separately would make the limit useless.
      return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
    },
  });
}
