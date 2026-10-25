/**
 * The logged-in user's own account: PATCH /users/me, PATCH /users/me/password,
 * DELETE /users/me. All three need authentication and a CSRF header (cookie requests).
 */
import request from 'supertest';
import {
  HabitCompletion,
  Session,
  User,
  Workspace,
  WorkspaceMember,
} from '../../src/models/index.js';
import { PASSWORD, createTestApp, loginAgent, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { createHabit } from '../helpers/factories.js';

const app = createTestApp();

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

it.each([
  ['PATCH', '/api/v1/users/me'],
  ['PATCH', '/api/v1/users/me/password'],
  ['DELETE', '/api/v1/users/me'],
])('%s %s requires authentication (401)', async (method, url) => {
  const res = await request(app)[method.toLowerCase()](url).send({});
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHENTICATED');
});

describe('PATCH /users/me', () => {
  it('updates name and timezone', async () => {
    const { agent, csrfToken } = await signupAgent(app);
    const res = await agent
      .patch('/api/v1/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: '  New Name ', timezone: 'Asia/Kolkata' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'New Name', timezone: 'Asia/Kolkata' });
  });

  it('merges notification preferences instead of replacing them', async () => {
    const { agent, csrfToken } = await signupAgent(app);
    const res = await agent
      .patch('/api/v1/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ notificationPreferences: { reminders: false } });

    expect(res.body.user.notificationPreferences).toEqual({ inApp: true, reminders: false });
  });

  it.each([
    ['an empty body', {}],
    ['an invalid timezone', { timezone: 'Nowhere/Land' }],
    ['an unknown preference key', { notificationPreferences: { sms: true } }],
    ['a non-boolean preference', { notificationPreferences: { inApp: 'yes' } }],
  ])('rejects %s with 422', async (_label, body) => {
    const { agent, csrfToken } = await signupAgent(app);
    const res = await agent.patch('/api/v1/users/me').set('X-CSRF-Token', csrfToken).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores fields that are not editable here (email, passwordHash)', async () => {
    const { agent, csrfToken, email } = await signupAgent(app);
    const res = await agent
      .patch('/api/v1/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Ok', email: 'hijack@example.com', passwordHash: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

describe('PATCH /users/me/password', () => {
  const NEW_PASSWORD = 'brand-new-pass-7';

  it('changes the password, revokes OTHER sessions and keeps the current one', async () => {
    const laptop = await signupAgent(app);
    const phone = await loginAgent(app, laptop);
    const tablet = await loginAgent(app, laptop);

    const res = await laptop.agent
      .patch('/api/v1/users/me/password')
      .set('X-CSRF-Token', laptop.csrfToken)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);

    expect((await laptop.agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await phone.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await tablet.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect(await Session.count()).toBe(1);

    // Old password no longer works; the new one does.
    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: laptop.email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    await loginAgent(app, { email: laptop.email, password: NEW_PASSWORD });
  });

  it('rejects a wrong current password with 422 and changes nothing', async () => {
    const laptop = await signupAgent(app);
    const phone = await loginAgent(app, laptop);

    const res = await laptop.agent
      .patch('/api/v1/users/me/password')
      .set('X-CSRF-Token', laptop.csrfToken)
      .send({ currentPassword: 'not-my-pass-1', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect((await phone.agent.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('applies the signup password rules to the new password', async () => {
    const { agent, csrfToken } = await signupAgent(app);
    const res = await agent
      .patch('/api/v1/users/me/password')
      .set('X-CSRF-Token', csrfToken)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('newPassword');
  });
});

describe('DELETE /users/me', () => {
  it('deletes the user, their personal workspace and its data, then clears cookies', async () => {
    const { agent, csrfToken, user } = await signupAgent(app);
    const workspace = await Workspace.findOne({ where: { ownerUserId: user.id } });
    const habit = await createHabit({ workspace, user: { id: user.id } });
    await HabitCompletion.create({
      habitId: habit.id,
      completedBy: user.id,
      completionDate: '2026-03-01',
    });

    const res = await agent
      .delete('/api/v1/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: PASSWORD });

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'].join(';')).toMatch(/hf_session=;/);
    expect(await User.count()).toBe(0);
    expect(await Workspace.count()).toBe(0);
    expect(await HabitCompletion.count()).toBe(0);
    expect(await Session.count()).toBe(0);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('requires the correct password (422) and keeps the account', async () => {
    const { agent, csrfToken } = await signupAgent(app);
    const res = await agent
      .delete('/api/v1/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: 'not-my-pass-1' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(await User.count()).toBe(1);
  });

  it('refuses (409) while the user still owns a team workspace, deleting nothing', async () => {
    const { agent, csrfToken, user } = await signupAgent(app);
    const team = await Workspace.create({
      name: 'Team',
      ownerUserId: user.id,
      workspaceType: 'team',
    });
    await WorkspaceMember.create({ workspaceId: team.id, userId: user.id, role: 'owner' });

    const res = await agent
      .delete('/api/v1/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESOURCE_IN_USE');
    // The transaction rolled back: the personal workspace is still there too.
    expect(await Workspace.count()).toBe(2);
    expect(await User.count()).toBe(1);
  });

  it("does not touch other users' data", async () => {
    const leaving = await signupAgent(app);
    const staying = await signupAgent(app);
    await leaving.agent
      .delete('/api/v1/users/me')
      .set('X-CSRF-Token', leaving.csrfToken)
      .send({ password: PASSWORD });

    expect((await staying.agent.get('/api/v1/auth/me')).status).toBe(200);
    expect(await Workspace.count()).toBe(1);
  });
});
