/**
 * Logs never contain secrets (CLAUDE.md §6). Real requests run through a logger whose output we
 * capture, then every captured line is searched for the actual secret values: the password, the
 * session token (cookie and Bearer), the CSRF token and the new password.
 *
 * This complements tests/unit/logger.test.js (redaction paths) by checking the whole pipeline:
 * pino-http's request/response serializers, Set-Cookie headers and logged errors.
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';
import { PASSWORD, cookieValue, seedPlans } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const lines = [];
const logger = createLogger({ level: 'trace', destination: { write: (line) => lines.push(line) } });
const app = createApp({ logger, rateLimits: { auth: { windowMs: 60_000, limit: 1000 } } });

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  lines.length = 0;
});

it('signup, login, an authenticated write, a password change and a failed login log no secrets', async () => {
  const email = 'secret-test@example.com';
  const newPassword = 'brand-new-pass-7';
  const agent = request.agent(app);

  const signup = await agent
    .post('/api/v1/auth/signup')
    .send({ name: 'Logger Test', email, password: PASSWORD });
  expect(signup.status).toBe(201);

  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  const session = cookieValue(login, 'hf_session');
  const csrf = cookieValue(login, 'csrf_token');

  // Cookie session + CSRF header on a write.
  const patch = await request(app)
    .patch('/api/v1/users/me')
    .set('Cookie', [`hf_session=${session}`, `csrf_token=${csrf}`])
    .set('X-CSRF-Token', csrf)
    .send({ name: 'Renamed' });
  expect(patch.status).toBe(200);

  // Bearer token (the future mobile client) on a read.
  const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${session}`);
  expect(me.status).toBe(200);

  const change = await request(app)
    .patch('/api/v1/users/me/password')
    .set('Authorization', `Bearer ${session}`)
    .send({ currentPassword: PASSWORD, newPassword });
  expect(change.status).toBe(204);

  // A failed login (logged at warn level, with the request).
  const failed = await request(app).post('/api/v1/auth/login').send({ email, password: 'nope-1' });
  expect(failed.status).toBe(401);

  const output = lines.join('');
  expect(lines.length).toBeGreaterThanOrEqual(6); // one line per request at least
  for (const secret of [PASSWORD, newPassword, 'nope-1', session, csrf]) {
    expect(output).not.toContain(secret);
  }
  expect(output).not.toMatch(/hf_session=/);
  expect(output).toContain('[REDACTED]'); // the headers were there, and were redacted
});
