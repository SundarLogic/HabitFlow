/**
 * Helpers for tests that need a logged-in user.
 *
 *   beforeAll(seedPlans);                                  // signup needs the `free` plan
 *   beforeEach(() => truncateAllTables({ except: ['plans'] }));
 *   const { agent, csrfToken } = await signupAgent(app);
 *   await agent.patch('/api/v1/users/me').set('X-CSRF-Token', csrfToken).send({ name: 'New' });
 *
 * A Supertest *agent* is a tiny cookie-keeping browser: cookies set by one response are sent
 * with its next requests, just like hf_session and csrf_token in a real browser.
 */
import { createRequire } from 'node:module';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { sequelize } from '../../src/models/index.js';

const require = createRequire(import.meta.url);
const plansSeeder = require('../../src/seeders/20261025000101-plans.cjs');

/** A password that satisfies the signup rules (8+ chars, a letter and a number). */
export const PASSWORD = 'correct-horse-42';

let sequence = 0;

/** Limits high enough that ordinary tests never hit them. */
const RELAXED_LIMIT = { windowMs: 60_000, limit: 10_000 };

/**
 * createApp() with relaxed rate limits. Tests reuse the same email and IP many times, which
 * would otherwise trip the 10-per-15-minutes auth limiter. Rate-limit tests use createApp().
 * @param {object} [deps] extra createApp dependencies (e.g. { now })
 */
export function createTestApp(deps = {}) {
  return createApp({ rateLimits: { api: RELAXED_LIMIT, auth: RELAXED_LIMIT }, ...deps });
}

/** Inserts the free/pro plans with the real (idempotent) seeder. */
export async function seedPlans() {
  await plansSeeder.up(sequelize.getQueryInterface());
}

/**
 * Reads a cookie value from a response's Set-Cookie headers.
 * @param {import('supertest').Response} res
 * @param {string} name
 * @returns {string | undefined}
 */
export function cookieValue(res, name) {
  const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return header ? decodeURIComponent(header.split(';')[0].slice(name.length + 1)) : undefined;
}

/**
 * Signs up a fresh user through the real API and returns a logged-in agent.
 * @param {import('express').Express} app
 * @param {object} [overrides] signup body fields to change
 * @returns {Promise<{ agent: import('supertest').Agent, user: object, email: string,
 *   password: string, csrfToken: string, sessionToken: string }>}
 */
export async function signupAgent(app, overrides = {}) {
  sequence += 1;
  const body = {
    name: `User ${sequence}`,
    email: `user${sequence}@example.com`,
    password: PASSWORD,
    ...overrides,
  };
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/signup').send(body);
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    agent,
    user: res.body.user,
    email: body.email,
    password: body.password,
    csrfToken: cookieValue(res, 'csrf_token'),
    sessionToken: cookieValue(res, 'hf_session'),
  };
}

/**
 * Logs in as an existing user with a NEW agent (= a second device).
 * @returns {Promise<{ agent: import('supertest').Agent, csrfToken: string, sessionToken: string }>}
 */
export async function loginAgent(app, { email, password }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    agent,
    csrfToken: cookieValue(res, 'csrf_token'),
    sessionToken: cookieValue(res, 'hf_session'),
  };
}
