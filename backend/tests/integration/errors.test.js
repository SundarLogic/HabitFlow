/**
 * Integration tests for the standard error responses: unknown routes (404), broken JSON (400),
 * oversized bodies (413), and errors thrown inside async handlers (AppError -> its status,
 * anything else -> a generic 500 that leaks no internal details).
 *
 * Some tests build a tiny throwaway Express app with routes that deliberately throw, plus our
 * real errorHandler, to check how the handler reacts.
 */
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';
import { ConflictError } from '../../src/utils/AppError.js';

describe('error responses', () => {
  const app = createApp();

  it('returns the standard 404 shape for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/does-not-exist not found' },
    });
  });

  it('returns 400 INVALID_JSON for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"name": "oops",');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
    });
  });

  it('returns 413 PAYLOAD_TOO_LARGE for bodies over 100kb', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(110 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  describe('with handlers that throw', () => {
    const throwingApp = express();
    throwingApp.get('/app-error', () =>
      Promise.reject(new ConflictError('Email already registered', { code: 'EMAIL_TAKEN' })),
    );
    throwingApp.get('/boom', () =>
      Promise.reject(new Error('secret internal detail: password=hunter2')),
    );
    throwingApp.use(notFoundHandler);
    throwingApp.use(errorHandler);

    it('maps AppError subclasses to their status and code (async errors are caught)', async () => {
      const res = await request(throwingApp).get('/app-error');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: { code: 'EMAIL_TAKEN', message: 'Email already registered' },
      });
    });

    it('hides internal messages and stack traces for unexpected errors', async () => {
      const res = await request(throwingApp).get('/boom');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/hunter2|stack/);
    });
  });
});
