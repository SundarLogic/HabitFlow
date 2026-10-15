/**
 * Tests for the validate() middleware (src/middleware/validate.js).
 *
 * There are no real feature routes yet, so we mount validate() on a throwaway route with Zod
 * schemas for params, query and body, then check:
 *   - valid input is replaced by Zod's parsed output (coerced, defaults applied, extras removed)
 *   - invalid input gets 422 VALIDATION_ERROR listing every problem
 */
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { validate } from '../../src/middleware/validate.js';

// A throwaway route exercising validate() through the real error handler.
const app = express();
app.use(express.json());
app.post(
  '/items/:id',
  validate({
    params: z.object({ id: z.uuid() }),
    query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
    body: z.object({ name: z.string().trim().min(1), count: z.number().int().optional() }),
  }),
  (req, res) => {
    res.json({ params: req.params, query: req.query, body: req.body });
  },
);
app.use(errorHandler);

const ID = '3f1c2a4e-8b9d-4c1e-9f2a-1b2c3d4e5f60';

describe('validate middleware', () => {
  it('replaces req values with the parsed output (coercion, defaults, unknown keys stripped)', async () => {
    const res = await request(app)
      .post(`/items/${ID}`)
      .send({ name: '  Read  ', extra: 'dropped' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: ID }, query: { limit: 20 }, body: { name: 'Read' } });

    const coerced = await request(app).post(`/items/${ID}?limit=5`).send({ name: 'Read' });
    expect(coerced.body.query).toEqual({ limit: 5 });
  });

  it('returns 422 VALIDATION_ERROR with details for every invalid field and location', async () => {
    const res = await request(app).post('/items/not-a-uuid?limit=500').send({ count: 1.5 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Request validation failed');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: 'params', path: 'id' }),
        expect.objectContaining({ location: 'query', path: 'limit' }),
        expect.objectContaining({ location: 'body', path: 'name' }),
        expect.objectContaining({ location: 'body', path: 'count' }),
      ]),
    );
    for (const detail of res.body.error.details) {
      expect(detail).toEqual({
        location: expect.any(String),
        path: expect.any(String),
        message: expect.any(String),
      });
    }
  });

  it('rejects a missing body', async () => {
    const res = await request(app).post(`/items/${ID}`);

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ location: 'body', path: '' }),
    ]);
  });
});
