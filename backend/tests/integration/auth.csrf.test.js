/**
 * CSRF protection (double-submit cookie, ADR-003): unsafe requests authenticated by cookie must
 * carry an X-CSRF-Token header equal to the csrf_token cookie. Bearer requests are exempt.
 */
import request from 'supertest';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const app = createTestApp();
const CSRF_ERROR = {
  error: { code: 'CSRF_TOKEN_INVALID', message: 'Missing or invalid CSRF token' },
};

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

it('rejects a cookie-authenticated POST without the header (403)', async () => {
  const { agent } = await signupAgent(app);
  const res = await agent.post('/api/v1/auth/logout');

  expect(res.status).toBe(403);
  expect(res.body).toEqual(CSRF_ERROR);
  // The request had no effect: still logged in.
  expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
});

it('rejects a header that does not match the cookie', async () => {
  const { agent } = await signupAgent(app);
  const res = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', 'guessed-value');
  expect(res.status).toBe(403);
  expect(res.body).toEqual(CSRF_ERROR);
});

it('rejects a header copied from ANOTHER user', async () => {
  const victim = await signupAgent(app);
  const attacker = await signupAgent(app);
  const res = await victim.agent
    .post('/api/v1/auth/logout')
    .set('X-CSRF-Token', attacker.csrfToken);
  expect(res.status).toBe(403);
});

it.each([
  ['PATCH', '/api/v1/users/me', { name: 'X' }],
  ['PATCH', '/api/v1/users/me/password', {}],
  ['DELETE', '/api/v1/users/me', {}],
])('protects %s %s, checking CSRF before validating the body', async (method, url, body) => {
  const { agent } = await signupAgent(app);
  const res = await agent[method.toLowerCase()](url).send(body);
  expect(res.status).toBe(403);
  expect(res.body).toEqual(CSRF_ERROR);
});

it('accepts the matching header', async () => {
  const { agent, csrfToken } = await signupAgent(app);
  const res = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken);
  expect(res.status).toBe(204);
});

it('does not require CSRF for Bearer-authenticated requests', async () => {
  const { sessionToken } = await signupAgent(app);
  const res = await request(app)
    .patch('/api/v1/users/me')
    .set('Authorization', `Bearer ${sessionToken}`)
    .send({ name: 'Mobile' });
  expect(res.status).toBe(200);
});

it('still requires CSRF when a cookie AND a Bearer header are both sent', async () => {
  const { agent, sessionToken } = await signupAgent(app);
  const res = await agent
    .patch('/api/v1/users/me')
    .set('Authorization', `Bearer ${sessionToken}`)
    .send({ name: 'Sneaky' });
  expect(res.status).toBe(403);
});

it('does not apply to GET requests', async () => {
  const { agent } = await signupAgent(app);
  expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
});
