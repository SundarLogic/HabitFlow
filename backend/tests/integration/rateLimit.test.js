/**
 * Rate limits: 10 login/signup attempts per 15 minutes per IP + email, and a general
 * per-IP limit on /api. Over the limit -> 429 RATE_LIMITED in the standard error shape.
 *
 * Each test builds its own app with createApp(): limiters live inside the app, so counters
 * start at zero and the REAL production limits are tested (except where noted).
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { PASSWORD, seedPlans } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const RATE_LIMITED = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
};

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

/** Sends `count` failed logins for `email` one after another; returns the last response. */
async function failLogins(app, email, count) {
  let res;
  for (let i = 0; i < count; i += 1) {
    res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-pass-1' });
  }
  return res;
}

it('allows 10 login attempts per email, then answers 429 with the standard error shape', async () => {
  const app = createApp();
  const tenth = await failLogins(app, 'victim@example.com', 10);
  expect(tenth.status).toBe(401);

  const eleventh = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'victim@example.com', password: PASSWORD });
  expect(eleventh.status).toBe(429);
  expect(eleventh.body).toEqual(RATE_LIMITED);
  expect(eleventh.headers.ratelimit).toBeDefined(); // standard RateLimit header (draft-8)
});

it('counts per email: a different email from the same IP is not blocked', async () => {
  const app = createApp();
  await failLogins(app, 'victim@example.com', 11);
  const other = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'someone@example.com', password: 'wrong-pass-1' });
  expect(other.status).toBe(401);
});

it('treats email case and spaces as the same key', async () => {
  const app = createApp();
  await failLogins(app, 'victim@example.com', 10);
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ' VICTIM@example.com', password: 'wrong-pass-1' });
  expect(res.status).toBe(429);
});

it('shares the counter between login and signup', async () => {
  const app = createApp();
  await failLogins(app, 'victim@example.com', 10);
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ name: 'V', email: 'victim@example.com', password: PASSWORD });
  expect(res.status).toBe(429);
});

it('applies the general /api limit to every endpoint (tiny limit for speed)', async () => {
  const app = createApp({ rateLimits: { api: { windowMs: 60_000, limit: 2 } } });
  expect((await request(app).get('/api/v1/health')).status).toBe(200);
  expect((await request(app).get('/api/v1/health')).status).toBe(200);
  const third = await request(app).get('/api/v1/health');
  expect(third.status).toBe(429);
  expect(third.body).toEqual(RATE_LIMITED);
});

describe('behind a reverse proxy (TRUST_PROXY)', () => {
  const tiny = { api: { windowMs: 60_000, limit: 1 } };
  const from = (app, ip) => request(app).get('/api/v1/health').set('X-Forwarded-For', ip);

  it('by default ignores X-Forwarded-For, so a client cannot dodge the limit by spoofing it', async () => {
    const app = createApp({ rateLimits: tiny });
    expect((await from(app, '203.0.113.1')).status).toBe(200);
    expect((await from(app, '203.0.113.2')).status).toBe(429);
  });

  it('with trustProxy = 1, counts each client IP separately', async () => {
    const app = createApp({ rateLimits: tiny, trustProxy: 1 });
    expect((await from(app, '203.0.113.1')).status).toBe(200);
    expect((await from(app, '203.0.113.2')).status).toBe(200);
    expect((await from(app, '203.0.113.1')).status).toBe(429);
  });
});
