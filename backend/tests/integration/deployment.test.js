/**
 * Deployment behaviour (Phase 12, docs/DEPLOYMENT.md):
 *   - behind the Vercel rewrite and Render's proxy (TRUST_PROXY=2), req.ip is the real client:
 *     it is logged, and each client gets its own rate-limit bucket;
 *   - unexpected errors reach error tracking with the request id and user id only;
 *   - Swagger UI is served at /api/docs outside production;
 *   - database.cjs turns TLS on with DB_SSL, sizes the pool, and gives the CLI the direct URL.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requestLogger } from '../../src/middleware/requestLogger.js';
import { setErrorTrackingClient } from '../../src/observability/errorTracking.js';

// What arrives at the app on Render, after the Vercel rewrite: Vercel puts the browser's IP in
// X-Forwarded-For, then Render's proxy appends the address it received the request from
// (Vercel's). The TCP peer is Render's proxy.
const CLIENT = '203.0.113.7';
const VERCEL_EGRESS = '76.76.21.21';
const viaVercelAndRender = (ip = CLIENT) => `${ip}, ${VERCEL_EGRESS}`;

describe('behind Vercel + Render (TRUST_PROXY=2)', () => {
  it('logs the real client IP for each request', async () => {
    const lines = [];
    const logger = createLogger({
      level: 'info',
      destination: { write: (l) => lines.push(JSON.parse(l)) },
    });
    const app = createApp({ logger, trustProxy: 2 });
    await request(app).get('/api/v1/health').set('X-Forwarded-For', viaVercelAndRender());
    expect(lines.at(-1)).toMatchObject({ clientIp: CLIENT });
  });

  it('a spoofed X-Forwarded-For sent by the browser does not change it', async () => {
    // Whether Vercel replaces the browser's header or appends to it, a forged value can only
    // sit further left, and we take exactly 2 hops from the right.
    const lines = [];
    const logger = createLogger({
      level: 'info',
      destination: { write: (l) => lines.push(JSON.parse(l)) },
    });
    const app = createApp({ logger, trustProxy: 2 });
    await request(app)
      .get('/api/v1/health')
      .set('X-Forwarded-For', `1.1.1.1, ${viaVercelAndRender()}`);
    expect(lines.at(-1)).toMatchObject({ clientIp: CLIENT });
  });

  it('gives each client its own rate-limit bucket', async () => {
    const app = createApp({ trustProxy: 2, rateLimits: { api: { windowMs: 60_000, limit: 1 } } });
    const from = (ip) =>
      request(app).get('/api/v1/health').set('X-Forwarded-For', viaVercelAndRender(ip));
    expect((await from('203.0.113.1')).status).toBe(200);
    expect((await from('203.0.113.2')).status).toBe(200);
    expect((await from('203.0.113.1')).status).toBe(429);
  });
});

describe('error tracking from the error handler', () => {
  afterEach(() => setErrorTrackingClient(null));

  it('reports 500s with the request id, user id, method and path (no query string)', async () => {
    const reported = [];
    const tags = {};
    setErrorTrackingClient({
      withScope: (fn) => fn({ setTag: (k, v) => (tags[k] = v), setUser: (u) => (tags.user = u) }),
      captureException: (err) => reported.push(err.message),
    });
    const app = express();
    app.use(requestLogger(createLogger({ level: 'silent' })));
    app.get('/boom', (req) => {
      req.user = { id: 'user-1', email: 'ana@example.com' };
      throw new Error('database exploded');
    });
    app.get('/missing', () => {
      const error = new Error('not found');
      error.status = 404;
      error.expose = true;
      throw error;
    });
    app.use(errorHandler);

    const res = await request(app).get('/boom?secret=1').set('X-Request-Id', 'req-123');
    expect(res.status).toBe(500);
    expect(reported).toEqual(['database exploded']);
    expect(tags).toEqual({
      requestId: 'req-123',
      method: 'GET',
      route: '/boom',
      user: { id: 'user-1' },
    });

    await request(app).get('/missing');
    expect(reported).toHaveLength(1); // client errors are not reported
  });
});

describe('Swagger UI (non-production)', () => {
  const app = createApp();

  it('serves the UI, our initializer and the OpenAPI spec', async () => {
    const redirect = await request(app).get('/api/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('/api/docs/');

    const page = await request(app).get('/api/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');

    const init = await request(app).get('/api/docs/swagger-initializer.js');
    expect(init.text).toContain("url: '/api/docs/openapi.yaml'");

    const spec = await request(app).get('/api/docs/openapi.yaml');
    expect(spec.status).toBe(200);
    expect(spec.headers['content-type']).toMatch(/yaml/);
    expect(spec.text).toMatch(/^openapi: 3/);
  });
});

describe('database.cjs (production settings)', () => {
  /** Loads database.cjs in a fresh Node process with the given environment. */
  function productionConfig(extraEnv) {
    const file = path.resolve('src/config/database.cjs');
    const out = execFileSync(
      process.execPath,
      ['-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(file)}).production))`],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://app@pooler.example.com/habitflow',
          ...extraEnv,
        },
      },
    );
    return JSON.parse(out);
  }

  it('enables verified TLS with DB_SSL=true and uses 5 pooled connections', () => {
    const config = productionConfig({ DB_SSL: 'true' });
    expect(config.url).toBe('postgres://app@pooler.example.com/habitflow');
    expect(config.dialectOptions.ssl).toEqual({ require: true, rejectUnauthorized: true });
    expect(config.pool.max).toBe(5);
  });

  it('leaves TLS off otherwise, and honours DB_POOL_MAX', () => {
    const config = productionConfig({ DB_POOL_MAX: '3' });
    expect(config.dialectOptions).toBeUndefined();
    expect(config.pool.max).toBe(3);
  });

  it('gives sequelize-cli the direct URL when DATABASE_DIRECT_URL is set', () => {
    const direct = 'postgres://app@direct.example.com/habitflow';
    expect(productionConfig({ DATABASE_DIRECT_URL: direct }).url).toBe(
      'postgres://app@pooler.example.com/habitflow', // the app keeps the pooled one
    );
    expect(productionConfig({ DATABASE_DIRECT_URL: direct, HABITFLOW_DB_CLIENT: 'cli' }).url).toBe(
      direct,
    );
  });
});
