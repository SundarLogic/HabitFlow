/**
 * Integration tests for GET /api/v1/health.
 *
 * "Integration" = the real Express app + real middleware (+ the real test database), driven by
 * Supertest. Supertest sends HTTP requests to the app in memory, so no server or port is needed:
 *   const res = await request(createApp()).get('/api/v1/health');
 *   expect(res.status).toBe(200);
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('GET /api/v1/health', () => {
  it('reports ok with a reachable database', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok', db: 'ok', time: expect.any(String) });
    expect(new Date(res.body.time).toISOString()).toBe(res.body.time);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('reports db "down" when the database check fails', async () => {
    const failingDb = {
      query: () => Promise.reject(new Error('connection refused')),
    };
    const res = await request(createApp({ db: failingDb })).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'down' });
  });

  it('generates an X-Request-Id, or echoes a safe incoming one', async () => {
    const app = createApp();

    const generated = await request(app).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await request(app).get('/api/v1/health').set('X-Request-Id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');

    const unsafe = await request(app).get('/api/v1/health').set('X-Request-Id', 'has spaces!');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS with credentials only for configured client origins', async () => {
    const app = createApp();

    const allowed = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
