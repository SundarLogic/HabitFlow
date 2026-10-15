/**
 * Health check routes.
 *
 * Final URL = app prefix + router prefix + route path:
 *   '/api/v1' (app.js) + '/health' (routes/index.js) + '/' (below)  =>  GET /api/v1/health
 *
 * Typical route with validation (pattern for later phases):
 *   router.post('/', validate({ body: createHabitSchema }), habitController.create);
 */
import { Router } from 'express';
import * as healthController from '../controllers/healthController.js';

export const healthRouter = Router();

healthRouter.get('/', healthController.getHealth);
