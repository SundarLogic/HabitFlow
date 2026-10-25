/**
 * routes/index.js — builds the main API router, mounted at /api/v1 in app.js.
 *
 * Each feature gets its own router file and is attached here under its path prefix. So
 * `router.use('/health', healthRouter)` means: requests to /api/v1/health/... go to healthRouter.
 *
 * Routers only wire URLs to middleware and controllers. No business logic goes in route files.
 * This is a factory because some routers (auth) hold per-app state such as rate-limit counters.
 */
import { Router } from 'express';
import { createAuthRouter } from './authRoutes.js';
import { habitRouter } from './habitRoutes.js';
import { healthRouter } from './healthRoutes.js';
import { userRouter } from './userRoutes.js';
import { workspaceRouter } from './workspaceRoutes.js';

/**
 * @param {{ authRateLimit: { windowMs: number, limit: number } }} options
 * @returns {import('express').Router}
 */
export function createApiRouter({ authRateLimit }) {
  const router = Router();
  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter({ authRateLimit }));
  router.use('/users', userRouter);
  router.use('/workspaces', workspaceRouter);
  router.use('/habits', habitRouter);
  return router;
}
