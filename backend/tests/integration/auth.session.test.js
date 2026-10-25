/**
 * Login, logout and the session lifecycle: POST /auth/login, POST /auth/logout, GET /auth/me,
 * GET /auth/csrf, Bearer tokens, expiry and sliding expiry (CLAUDE.md §3.1).
 */
import request from 'supertest';
import { Session, User } from '../../src/models/index.js';
import { hashToken } from '../../src/utils/tokens.js';
import {
  PASSWORD,
  cookieValue,
  createTestApp,
  loginAgent,
  seedPlans,
  signupAgent,
} from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const app = createTestApp();
const MINUTE = 60 * 1000;

/** The session row for a raw token, looked up by hash the way the app does it. */
const sessionFor = (token) => Session.findOne({ where: { tokenHash: hashToken(token) } });

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

describe('POST /auth/login', () => {
  it('logs in, sets both cookies and records last_login_at', async () => {
    const { email } = await signupAgent(app);
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.lastLoginAt).toEqual(expect.any(String));
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(cookieValue(res, 'hf_session')).toHaveLength(43); // 32 bytes, base64url
    expect(cookieValue(res, 'csrf_token')).toHaveLength(43);
  });

  it('gives each login its own session (one per device)', async () => {
    const { email } = await signupAgent(app);
    await loginAgent(app, { email, password: PASSWORD });
    expect(await Session.count()).toBe(2);
  });

  it('rejects a wrong password with a generic 401 INVALID_CREDENTIALS', async () => {
    const { email } = await signupAgent(app);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password-1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const { email } = await signupAgent(app);
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password-1' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password-1' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('validates the body (422)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['email', 'password']);
  });
});

describe('GET /auth/me', () => {
  it('returns the user, workspaces, active workspace and plan', async () => {
    const { agent, user } = await signupAgent(app, { name: 'Ana' });
    const res = await agent.get('/api/v1/auth/me');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      user: expect.objectContaining({ id: user.id, name: 'Ana' }),
      workspaces: [
        { id: expect.any(String), name: "Ana's Habits", type: 'personal', role: 'owner' },
      ],
      activeWorkspaceId: res.body.workspaces[0].id,
      plan: { code: 'free', limits: { maxActiveHabits: 10, historyDays: null } },
    });
  });

  it('returns 401 UNAUTHENTICATED without a cookie or token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  });

  it('returns 401 for a made-up session token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'hf_session=not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('Bearer tokens (future mobile client)', () => {
  it('accepts the session token as Authorization: Bearer', async () => {
    const { sessionToken, user } = await signupAgent(app);
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('rejects a malformed Authorization header', async () => {
    const { sessionToken } = await signupAgent(app);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', sessionToken);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('deletes the session, clears cookies, and the old token stops working', async () => {
    const { agent, csrfToken, sessionToken } = await signupAgent(app);

    const res = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken);
    expect(res.status).toBe(204);
    // Clearing a cookie = setting it empty with an expiry in the past.
    expect(res.headers['set-cookie'].join(';')).toMatch(/hf_session=;.*Expires=Thu, 01 Jan 1970/);
    expect(await sessionFor(sessionToken)).toBeNull();

    // Revocation is immediate: replaying the old token (e.g. a stolen copy) fails.
    const replay = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(replay.status).toBe(401);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('only logs out the current device', async () => {
    const { agent, csrfToken, email } = await signupAgent(app);
    const phone = await loginAgent(app, { email, password: PASSWORD });

    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken);
    expect((await phone.agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('session expiry', () => {
  it('rejects an expired session with 401 and deletes it', async () => {
    const { agent, sessionToken } = await signupAgent(app);
    const session = await sessionFor(sessionToken);
    await session.update({ expiresAt: new Date(Date.now() - 1000) });

    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(await sessionFor(sessionToken)).toBeNull();
  });

  it('slides the expiry forward when the session was last used over 5 minutes ago', async () => {
    const { agent, sessionToken } = await signupAgent(app);
    const session = await sessionFor(sessionToken);
    const staleExpiry = new Date(Date.now() + 24 * 60 * MINUTE);
    await session.update({ lastUsedAt: new Date(Date.now() - 6 * MINUTE), expiresAt: staleExpiry });

    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    await session.reload();
    expect(session.expiresAt.getTime()).toBeGreaterThan(staleExpiry.getTime());
    expect(Date.now() - session.lastUsedAt.getTime()).toBeLessThan(MINUTE);
    // The cookie is re-sent so the browser's copy lives as long as the session.
    expect(cookieValue(res, 'hf_session')).toBe(sessionToken);
  });

  it('does not write to the sessions table again within 5 minutes', async () => {
    const { agent, sessionToken } = await signupAgent(app);
    const session = await sessionFor(sessionToken);
    const lastUsedAt = new Date(Date.now() - 2 * MINUTE);
    await session.update({ lastUsedAt });

    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    await session.reload();
    expect(session.lastUsedAt.getTime()).toBe(lastUsedAt.getTime());
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('uses the injected clock (createApp({ now })) for expiry decisions', async () => {
    const { sessionToken } = await signupAgent(app);
    const thirtyOneDaysLater = () => new Date(Date.now() + 31 * 24 * 60 * MINUTE);
    const futureApp = createTestApp({ now: thirtyOneDaysLater });

    const res = await request(futureApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/csrf', () => {
  it('issues a readable csrf_token cookie and returns the same token', async () => {
    const res = await request(app).get('/api/v1/auth/csrf');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toHaveLength(43);
    expect(cookieValue(res, 'csrf_token')).toBe(res.body.csrfToken);
    expect(res.headers['set-cookie'][0]).not.toMatch(/HttpOnly/);
  });

  it('keeps an existing token (refreshing its lifetime) so other tabs keep working', async () => {
    const { agent, csrfToken } = await signupAgent(app);
    const res = await agent.get('/api/v1/auth/csrf');
    expect(res.body.csrfToken).toBe(csrfToken);
  });

  it('replaces a token it did not issue', async () => {
    const res = await request(app).get('/api/v1/auth/csrf').set('Cookie', 'csrf_token=planted');
    expect(res.body.csrfToken).not.toBe('planted');
  });
});

it('never exposes the password hash through any auth response', async () => {
  const { agent, email } = await signupAgent(app);
  const responses = [
    await agent.get('/api/v1/auth/me'),
    await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD }),
  ];
  const stored = await User.scope('withPassword').findOne({ where: { email } });
  for (const res of responses) {
    expect(JSON.stringify(res.body)).not.toContain(stored.passwordHash);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
  }
});
