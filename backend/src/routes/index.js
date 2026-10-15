/**
 * routes/index.js — the main API router, mounted at /api/v1 in app.js.
 *
 * Each feature gets its own router file (healthRoutes.js, later authRoutes.js, habitRoutes.js...)
 * and is attached here under its path prefix. So `apiRouter.use('/health', healthRouter)`
 * means: requests to /api/v1/health/... are handled by healthRouter.
 *
 * Routers only wire URLs to middleware and controllers. No business logic goes in route files.
 */
import { Router } from 'express';
import { healthRouter } from './healthRoutes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
