/**
 * Auth routes, mounted at /api/v1/auth.
 *
 * Middleware order matters and reads left to right:
 *   rate limit -> validate body -> controller                       (signup, login)
 *   requireAuth -> csrfProtection -> controller                     (logout)
 *   requireAuth -> resolveWorkspace -> controller                   (me)
 *
 * This is a factory (not a module-level router) because the auth rate limiter keeps its
 * counters in memory: each createApp() gets its own, so tests don't share counters.
 */
import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { createAuthRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loginBody, signupBody } from '../validators/authValidators.js';

/**
 * @param {{ authRateLimit: { windowMs: number, limit: number } }} options
 * @returns {import('express').Router}
 */
export function createAuthRouter({ authRateLimit }) {
  const router = Router();
  // One limiter shared by signup and login, so the 10 attempts are counted across both.
  const authLimiter = createAuthRateLimiter(authRateLimit);

  router.post('/signup', authLimiter, validate({ body: signupBody }), authController.signup);
  router.post('/login', authLimiter, validate({ body: loginBody }), authController.login);
  router.post('/logout', requireAuth, csrfProtection, authController.logout);
  router.get('/me', requireAuth, csrfProtection, resolveWorkspace, authController.me);
  router.get('/csrf', authController.csrf);

  return router;
}
