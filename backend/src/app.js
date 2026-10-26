/**
 * app.js — builds the Express application (but does NOT start listening on a port).
 *
 * Why split app.js and server.js?
 *   - server.js starts the real HTTP server.
 *   - Tests import createApp() directly and send fake requests with Supertest, which needs an
 *     app object, not a running server. Keeping them separate makes the app easy to test.
 *
 * How a request flows through the app (top to bottom, in the order of app.use calls):
 *   requestLogger -> helmet -> cors -> express.json -> cookieParser -> /api rate limit
 *     -> /api/v1 routes -> notFoundHandler (no route matched) -> errorHandler (something failed)
 *
 * Protected routes then add their own middleware: requireAuth (who is calling?),
 * csrfProtection (did our SPA send this?), resolveWorkspace (which workspace?). See routes/.
 *
 * Async errors: we use Express 5, which automatically catches errors thrown inside `async`
 * route handlers and passes them to errorHandler. So we do NOT need try/catch in every
 * controller or an "asyncHandler" wrapper.
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { API_RATE_LIMIT, AUTH_RATE_LIMIT } from './config/auth.js';
import { env } from './config/env.js';
import { logger as defaultLogger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { sequelize } from './models/index.js';
import { createApiRouter } from './routes/index.js';
import { now as systemNow } from './utils/clock.js';

/**
 * Creates a fully configured Express app.
 *
 * The parameters are "dependencies" with sensible defaults. Production code calls
 * createApp() with no arguments; tests can pass fakes, e.g. createApp({ db: fakeDb }) to
 * simulate the database being down. This pattern is called dependency injection.
 *
 * @param {object} [deps]
 * @param {object} [deps.db] database connection (defaults to the real Sequelize instance)
 * @param {object} [deps.logger] pino logger (defaults to the shared app logger)
 * @param {() => Date} [deps.now] clock used by auth (session expiry); tests can freeze time
 * @param {{ api?: { windowMs: number, limit: number }, auth?: { windowMs: number, limit: number } }}
 *   [deps.rateLimits] override the rate limits (tests use tiny ones)
 * @param {number} [deps.trustProxy] number of reverse proxies in front (env TRUST_PROXY)
 * @returns {import('express').Express}
 */
export function createApp({
  db = sequelize,
  logger = defaultLogger,
  now = systemNow,
  rateLimits = {},
  trustProxy = env.TRUST_PROXY,
} = {}) {
  const app = express();

  // How many proxies' X-Forwarded-For entries to believe when working out req.ip. 0 = ignore
  // the header entirely, so a client can't spoof its IP to dodge the rate limits.
  app.set('trust proxy', trustProxy);

  // app.locals is a place to store app-wide values. Controllers read the db from here
  // (req.app.locals.db) so tests can swap it out.
  app.locals.db = db;
  // Same idea for the clock: middleware and controllers read req.app.locals.now.
  app.locals.now = now;

  // 1. Log every request/response and give each request a unique X-Request-Id.
  //    Registered first so even failing requests are logged.
  app.use(requestLogger(logger));

  // 2. helmet sets security-related HTTP headers (e.g. X-Content-Type-Options: nosniff)
  //    and removes the X-Powered-By header that would reveal we use Express.
  app.use(helmet());

  // 3. CORS: browsers block JavaScript on other websites from calling our API unless we allow
  //    it. We only allow our own frontend origins (from CLIENT_ORIGINS in .env).
  //    credentials: true lets the browser send cookies (needed for login sessions).
  //    exposedHeaders lets frontend code read X-Request-Id (useful for bug reports).
  app.use(
    cors({
      origin: env.CLIENT_ORIGINS,
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // 4. Parse JSON request bodies into req.body. The 100kb limit protects the server from
  //    huge payloads; larger bodies get a 413 error.
  app.use(express.json({ limit: '100kb' }));

  // 5. Parse the Cookie header into req.cookies (used later for session + CSRF cookies).
  app.use(cookieParser());

  // 6. General rate limit for the whole API, per IP. Login/signup have a stricter one of their
  //    own (routes/authRoutes.js). Limiters are created per app, so tests don't share counters.
  app.use('/api', createRateLimiter(rateLimits.api ?? API_RATE_LIMIT));

  // 7. All API routes live under /api/v1 (see routes/index.js).
  app.use('/api/v1', createApiRouter({ authRateLimit: rateLimits.auth ?? AUTH_RATE_LIMIT }));

  // 8. If no route matched, respond with a 404 in our standard error format.
  app.use(notFoundHandler);

  // 9. Error handler MUST be registered last. Any error thrown or passed to next(err)
  //    anywhere above ends up here and is turned into a JSON error response.
  app.use(errorHandler);

  return app;
}
