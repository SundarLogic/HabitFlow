/**
 * Test data factories: small helpers that insert valid rows with sensible defaults, so each
 * test only spells out the fields it actually cares about.
 *
 *   const { user, workspace } = await createUserWithWorkspace();
 *   const habit = await createHabit({ workspace, user, frequencyType: 'weekdays' });
 *
 * They go through the real models (and therefore model validation). Combine with
 * truncateAllTables() in beforeEach so every test starts from empty tables.
 */
import { Habit, User, Workspace, WorkspaceMember } from '../../src/models/index.js';

// Makes emails unique across one test file without needing random values.
let sequence = 0;

/**
 * Inserts a user. passwordHash is a placeholder string: these helpers never log anyone in.
 * @param {object} [overrides] any User attributes to change
 * @returns {Promise<User>}
 */
export function createUser(overrides = {}) {
  sequence += 1;
  return User.create({
    name: `Test User ${sequence}`,
    email: `user${sequence}@example.com`,
    passwordHash: '$2b$12$placeholderplaceholderplaceholderplaceholderplace',
    ...overrides,
  });
}

/**
 * Inserts a user plus their personal workspace and owner membership, like signup will.
 * @param {object} [userOverrides] any User attributes to change
 * @returns {Promise<{ user: User, workspace: Workspace, membership: WorkspaceMember }>}
 */
export async function createUserWithWorkspace(userOverrides = {}) {
  const user = await createUser(userOverrides);
  const workspace = await Workspace.create({
    name: 'Personal',
    ownerUserId: user.id,
    workspaceType: 'personal',
  });
  const membership = await WorkspaceMember.create({
    workspaceId: workspace.id,
    userId: user.id,
    role: 'owner',
  });
  return { user, workspace, membership };
}

/**
 * Inserts a daily habit in `workspace`, created by `user`.
 * @param {{ workspace: Workspace, user: User } & object} options plus any Habit attributes
 * @returns {Promise<Habit>}
 */
export function createHabit({ workspace, user, ...overrides }) {
  return Habit.create({
    workspaceId: workspace.id,
    createdBy: user.id,
    name: 'Drink water',
    frequencyType: 'daily',
    startDate: '2026-01-01',
    ...overrides,
  });
}
