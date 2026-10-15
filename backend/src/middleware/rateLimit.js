/**
 * Rate limiting: limits how many requests one client (by IP address) can make in a time window.
 * Used to slow down password-guessing attacks on login/signup (wired up in the auth phase).
 *
 * Example usage in a router:
 *   const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }); // 10 per 15 min
 *   router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
 */
import { rateLimit } from 'express-rate-limit';
import { RateLimitedError } from '../utils/AppError.js';

/**
 * @param {object} options
 * @param {number} options.windowMs length of the time window in milliseconds
 * @param {number} options.limit max requests allowed per client within that window
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
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
