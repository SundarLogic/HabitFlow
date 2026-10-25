/**
 * Workspace authorization: GET /workspaces, the X-Workspace-Id header (resolveWorkspace) and
 * requireRole. Rule (ADR-029): a workspace you're not a member of is a 404, never a 403.
 */
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requireRole } from '../../src/middleware/workspace.js';
import { Plan, Workspace, WorkspaceMember, WorkspaceSubscription } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const app = createTestApp();

beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
});

/** Creates a team workspace owned by `ownerId`, optionally adding `memberId` as a member. */
async function createTeam(ownerId, { memberId, role = 'member' } = {}) {
  const team = await Workspace.create({
    name: 'Team',
    ownerUserId: ownerId,
    workspaceType: 'team',
  });
  await WorkspaceMember.create({ workspaceId: team.id, userId: ownerId, role: 'owner' });
  if (memberId) await WorkspaceMember.create({ workspaceId: team.id, userId: memberId, role });
  return team;
}

describe('GET /workspaces', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/workspaces')).status).toBe(401);
  });

  it('lists only my workspaces with my role, personal first, paginated', async () => {
    const me = await signupAgent(app, { name: 'Me' });
    const other = await signupAgent(app, { name: 'Other' });
    await createTeam(other.user.id, { memberId: me.user.id, role: 'admin' });
    await createTeam(other.user.id); // not mine

    const res = await me.agent.get('/api/v1/workspaces');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { id: expect.any(String), name: "Me's Habits", type: 'personal', role: 'owner' },
        { id: expect.any(String), name: 'Team', type: 'team', role: 'admin' },
      ],
      meta: { page: 1, limit: 20, total: 2 },
    });

    const page2 = await me.agent.get('/api/v1/workspaces?page=2&limit=1');
    expect(page2.body.data.map((w) => w.type)).toEqual(['team']);
    expect(page2.body.meta).toEqual({ page: 2, limit: 1, total: 2 });
  });

  it('rejects out-of-range pagination with 422', async () => {
    const { agent } = await signupAgent(app);
    expect((await agent.get('/api/v1/workspaces?limit=101')).status).toBe(422);
    expect((await agent.get('/api/v1/workspaces?page=0')).status).toBe(422);
  });
});

describe('X-Workspace-Id (resolveWorkspace)', () => {
  it("returns 404 for another user's workspace", async () => {
    const me = await signupAgent(app);
    const other = await signupAgent(app);
    const othersWorkspace = await Workspace.findOne({ where: { ownerUserId: other.user.id } });

    const res = await me.agent.get('/api/v1/auth/me').set('X-Workspace-Id', othersWorkspace.id);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
  });

  it('returns the SAME 404 for a workspace that does not exist (no existence leak)', async () => {
    const me = await signupAgent(app);
    const other = await signupAgent(app);
    const othersWorkspace = await Workspace.findOne({ where: { ownerUserId: other.user.id } });

    const foreign = await me.agent.get('/api/v1/auth/me').set('X-Workspace-Id', othersWorkspace.id);
    const missing = await me.agent
      .get('/api/v1/auth/me')
      .set('X-Workspace-Id', crypto.randomUUID());
    expect(missing.status).toBe(foreign.status);
    expect(missing.body).toEqual(foreign.body);
  });

  it('returns 422 for a malformed id', async () => {
    const { agent } = await signupAgent(app);
    const res = await agent.get('/api/v1/auth/me').set('X-Workspace-Id', 'not-a-uuid');
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [{ location: 'headers', path: 'x-workspace-id', message: 'must be a UUID' }],
    });
  });

  it('selects a workspace I am a member of, with its plan', async () => {
    const me = await signupAgent(app);
    const other = await signupAgent(app);
    const team = await createTeam(other.user.id, { memberId: me.user.id });
    const pro = await Plan.findOne({ where: { code: 'pro' } });
    await WorkspaceSubscription.create({ workspaceId: team.id, planId: pro.id, status: 'active' });

    const res = await me.agent.get('/api/v1/auth/me').set('X-Workspace-Id', team.id);
    expect(res.status).toBe(200);
    expect(res.body.activeWorkspaceId).toBe(team.id);
    expect(res.body.plan).toEqual({
      code: 'pro',
      limits: { maxActiveHabits: null, historyDays: null },
    });
  });

  it('defaults to the personal workspace without the header', async () => {
    const me = await signupAgent(app);
    const personal = await Workspace.findOne({ where: { ownerUserId: me.user.id } });
    const res = await me.agent.get('/api/v1/auth/me');
    expect(res.body.activeWorkspaceId).toBe(personal.id);
  });

  it('falls back to the free plan when the subscription is canceled', async () => {
    const me = await signupAgent(app);
    await WorkspaceSubscription.update({ status: 'canceled' }, { where: {} });
    const res = await me.agent.get('/api/v1/auth/me');
    expect(res.body.plan.code).toBe('free');
  });
});

describe('requireRole', () => {
  /** A throwaway app where a fake resolveWorkspace sets the role, then requireRole checks it. */
  function appWithRole(role, allowed) {
    const testApp = express();
    testApp.get(
      '/x',
      (req, res, next) => {
        req.membership = { role };
        next();
      },
      requireRole(...allowed),
      (req, res) => res.json({ ok: true }),
    );
    testApp.use(errorHandler);
    return testApp;
  }

  it('lets an allowed role through', async () => {
    const res = await request(appWithRole('admin', ['owner', 'admin'])).get('/x');
    expect(res.status).toBe(200);
  });

  it('rejects other roles with 403 INSUFFICIENT_ROLE', async () => {
    const res = await request(appWithRole('member', ['owner', 'admin'])).get('/x');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });
});
