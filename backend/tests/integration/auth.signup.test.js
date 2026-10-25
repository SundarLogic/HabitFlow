/**
 * POST /api/v1/auth/signup: account creation, the signup transaction (user + personal workspace
 * + owner membership + free subscription + session), cookies, and input validation.
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import {
  Session,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceSubscription,
} from '../../src/models/index.js';
import { PASSWORD, cookieValue, createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const URL = '/api/v1/auth/signup';
const app = createTestApp();
const valid = { name: 'Ana Lima', email: 'ana@example.com', password: PASSWORD };

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

describe('successful signup', () => {
  it('returns 201 with the public user and never a password hash', async () => {
    const res = await request(app)
      .post(URL)
      .send({ ...valid, timezone: 'Europe/Lisbon' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: {
        id: expect.any(String),
        name: 'Ana Lima',
        email: 'ana@example.com',
        timezone: 'Europe/Lisbon',
        notificationPreferences: { inApp: true, reminders: true },
        lastLoginAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it('defaults the timezone to UTC', async () => {
    const res = await request(app).post(URL).send(valid);
    expect(res.body.user.timezone).toBe('UTC');
  });

  it('creates the personal workspace, owner membership, free subscription and a session', async () => {
    const res = await request(app).post(URL).send(valid);
    const userId = res.body.user.id;

    const workspace = await Workspace.findOne({ where: { ownerUserId: userId } });
    expect(workspace).toMatchObject({ name: "Ana Lima's Habits", workspaceType: 'personal' });
    expect(await WorkspaceMember.findOne({ where: { userId } })).toMatchObject({
      workspaceId: workspace.id,
      role: 'owner',
    });
    const subscription = await WorkspaceSubscription.findOne({
      where: { workspaceId: workspace.id },
      include: ['plan'],
    });
    expect(subscription.status).toBe('active');
    expect(subscription.plan.code).toBe('free');

    const session = await Session.findOne({ where: { userId } });
    // Only the SHA-256 hash is stored, never the raw token from the cookie.
    const token = cookieValue(res, 'hf_session');
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.tokenHash).not.toBe(token);
  });

  it('stores the password with bcrypt cost 12', async () => {
    await request(app).post(URL).send(valid);
    const user = await User.scope('withPassword').findOne({ where: { email: valid.email } });
    expect(user.passwordHash).toMatch(/^\$2b\$12\$/);
  });

  it('keeps the workspace name within 100 characters for a 100-character user name', async () => {
    const name = 'N'.repeat(100);
    const res = await request(app)
      .post(URL)
      .send({ ...valid, name });
    const workspace = await Workspace.findOne({ where: { ownerUserId: res.body.user.id } });
    expect(workspace.name).toHaveLength(100);
    expect(workspace.name.endsWith("'s Habits")).toBe(true);
  });

  it('sets hf_session (HttpOnly) and csrf_token (readable) cookies with SameSite=Lax', async () => {
    const res = await request(app).post(URL).send(valid);
    const cookies = res.headers['set-cookie'];
    const session = cookies.find((c) => c.startsWith('hf_session='));
    const csrf = cookies.find((c) => c.startsWith('csrf_token='));

    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Path=\//);
    expect(session).toMatch(/Max-Age=2592000/); // 30 days (SESSION_TTL_DAYS default)
    expect(csrf).not.toMatch(/HttpOnly/);
    expect(csrf).toMatch(/SameSite=Lax/);
    // Secure is off in tests because COOKIE_SECURE defaults to false outside production.
    expect(session).not.toMatch(/Secure/);
  });

  it('logs the user in: /auth/me works straight after signup', async () => {
    const { agent } = await signupAgent(app);
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
  });
});

describe('duplicate and case-insensitive emails', () => {
  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await request(app).post(URL).send(valid);
    const res = await request(app)
      .post(URL)
      .send({ ...valid, name: 'Someone else' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
    });
  });

  it('trims and lowercases emails, so a different case is the same account', async () => {
    const res = await request(app)
      .post(URL)
      .send({ ...valid, email: '  Ana@Example.COM ' });
    expect(res.body.user.email).toBe('ana@example.com');

    const dup = await request(app)
      .post(URL)
      .send({ ...valid, email: 'ANA@example.com' });
    expect(dup.status).toBe(409);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'aNa@EXAMPLE.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });
});

describe('validation errors (422)', () => {
  it.each([
    ['a short password', { password: 'abc123' }, 'password'],
    ['a password without a number', { password: 'onlyletters' }, 'password'],
    ['a password without a letter', { password: '1234567890' }, 'password'],
    ['a password over 128 characters', { password: `a1${'x'.repeat(127)}` }, 'password'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['an invalid timezone', { timezone: 'Mars/Base' }, 'timezone'],
    ['an empty name', { name: '   ' }, 'name'],
    ['a name over 100 characters', { name: 'x'.repeat(101) }, 'name'],
  ])('rejects %s', async (_label, override, field) => {
    const res = await request(app)
      .post(URL)
      .send({ ...valid, ...override });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ location: 'body', path: field })]),
    );
    expect(await User.count()).toBe(0);
  });

  it('rejects a missing body, listing every missing field', async () => {
    const res = await request(app).post(URL).send({});
    expect(res.status).toBe(422);
    const paths = res.body.error.details.map((d) => d.path).sort();
    expect(paths).toEqual(['email', 'name', 'password']);
  });

  it('accepts non-ASCII letters and numbers in passwords', async () => {
    const res = await request(app)
      .post(URL)
      .send({ ...valid, password: 'çaféçafé٣' });
    expect(res.status).toBe(201);
  });
});

describe('signup transaction', () => {
  it('leaves no user row behind when the workspace insert fails', async () => {
    const spy = jest.spyOn(Workspace, 'create').mockRejectedValueOnce(new Error('boom'));
    try {
      const res = await request(app).post(URL).send(valid);
      expect(res.status).toBe(500);
      expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    } finally {
      spy.mockRestore();
    }

    expect(await User.count()).toBe(0);
    expect(await Session.count()).toBe(0);
    // The same email can sign up afterwards: nothing was half-created.
    expect((await request(app).post(URL).send(valid)).status).toBe(201);
  });
});
