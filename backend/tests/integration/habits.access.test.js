/**
 * Authorization for /habits: authentication (401), CSRF (403), and workspace isolation.
 * Another user's habit, or one in a workspace you can't use, is a 404 for every operation,
 * and nothing about it changes.
 */
import request from 'supertest';
import { Habit, Workspace, WorkspaceMember } from '../../src/models/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';
import { call, createHabitViaApi } from '../helpers/habits.js';

const app = createTestApp();
const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Habit not found' } };

let alice;
let bob;
let bobsHabit;
beforeAll(seedPlans);
beforeEach(async () => {
  await truncateAllTables({ except: ['plans'] });
  alice = await signupAgent(app);
  bob = await signupAgent(app);
  bobsHabit = await createHabitViaApi(bob, { name: "Bob's habit", category: 'Secret' });
});

it.each([
  ['get', '/api/v1/habits'],
  ['post', '/api/v1/habits'],
  ['get', '/api/v1/habits/categories'],
  ['patch', '/api/v1/habits/reorder'],
  ['get', '/api/v1/habits/7c9e6679-7425-40de-944b-e07fc1f90ae7'],
])('%s %s requires authentication (401)', async (method, url) => {
  const res = await request(app)[method](url).send({});
  expect(res.status).toBe(401);
});

it('requires the CSRF header for cookie-authenticated writes', async () => {
  const res = await alice.agent.post('/api/v1/habits').send({ name: 'X', frequencyType: 'daily' });
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
});

describe("another user's habit is invisible (404) and untouched", () => {
  it.each([
    ['GET', 'get', '', undefined],
    ['PATCH', 'patch', '', { name: 'Hacked' }],
    ['DELETE', 'delete', '', undefined],
    ['DELETE permanent', 'delete', '?permanent=true', undefined],
    ['archive', 'post', '/archive', undefined],
    ['unarchive', 'post', '/unarchive', undefined],
  ])('%s -> 404', async (_label, method, suffix, body) => {
    const res = await call(alice, method, `/api/v1/habits/${bobsHabit.id}${suffix}`, body);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);

    const stored = await Habit.findByPk(bobsHabit.id);
    expect(stored).toMatchObject({ name: "Bob's habit", status: 'active' });
  });

  it('reorder with a foreign id -> 404, and nothing is reordered', async () => {
    const mine = await createHabitViaApi(alice);
    const res = await call(alice, 'patch', '/api/v1/habits/reorder', {
      items: [
        { id: mine.id, sortOrder: 50 },
        { id: bobsHabit.id, sortOrder: 99 },
      ],
    });
    expect(res.status).toBe(404);
    expect((await Habit.findByPk(mine.id)).sortOrder).toBe(0);
    expect((await Habit.findByPk(bobsHabit.id)).sortOrder).toBe(0);
  });

  it('is not listed, searchable, or visible in categories', async () => {
    await createHabitViaApi(alice, { name: 'Mine' });
    const list = await call(alice, 'get', '/api/v1/habits?status=all&search=Bob');
    expect(list.body.meta.total).toBe(0);
    const categories = await call(alice, 'get', '/api/v1/habits/categories');
    expect(categories.body.data).toEqual([]);
  });
});

describe('X-Workspace-Id', () => {
  it("can't reach another user's workspace (404 from resolveWorkspace)", async () => {
    const bobsWorkspace = await Workspace.findOne({ where: { ownerUserId: bob.user.id } });
    const res = await call(alice, 'get', '/api/v1/habits', undefined, {
      'X-Workspace-Id': bobsWorkspace.id,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Workspace not found');
  });

  it('scopes habits to the selected workspace for a member', async () => {
    const team = await Workspace.create({
      name: 'Team',
      ownerUserId: bob.user.id,
      workspaceType: 'team',
    });
    await WorkspaceMember.create({ workspaceId: team.id, userId: alice.user.id, role: 'member' });
    const teamHeader = { 'X-Workspace-Id': team.id };

    const teamHabit = await createHabitViaApi(alice, { name: 'Team habit' }, teamHeader);
    await createHabitViaApi(alice, { name: 'Personal habit' });

    const inTeam = await call(alice, 'get', '/api/v1/habits', undefined, teamHeader);
    expect(inTeam.body.data.map((h) => h.name)).toEqual(['Team habit']);
    const inPersonal = await call(alice, 'get', '/api/v1/habits');
    expect(inPersonal.body.data.map((h) => h.name)).toEqual(['Personal habit']);

    // A team habit is not reachable through the personal workspace...
    expect((await call(alice, 'get', `/api/v1/habits/${teamHabit.id}`)).status).toBe(404);
    // ...only with the team workspace selected.
    const viaTeam = await call(
      alice,
      'get',
      `/api/v1/habits/${teamHabit.id}`,
      undefined,
      teamHeader,
    );
    expect(viaTeam.status).toBe(200);
  });
});
