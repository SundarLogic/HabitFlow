/**
 * Model behaviour that later phases rely on: the User password scopes, camelCase <-> snake_case
 * mapping, the renamed joined_at timestamp, and the associations defined in models/index.js.
 */
import { QueryTypes } from 'sequelize';
import { Habit, HabitScheduleDay, sequelize, User, Workspace } from '../../src/models/index.js';
import { truncateAllTables } from '../helpers/db.js';
import { createHabit, createUserWithWorkspace } from '../helpers/factories.js';

beforeEach(async () => {
  await truncateAllTables();
});

describe('User password scopes', () => {
  it('never loads passwordHash by default', async () => {
    const { user } = await createUserWithWorkspace();
    const found = await User.findByPk(user.id);
    expect(found.get('passwordHash')).toBeUndefined();
  });

  it("loads passwordHash only through the 'withPassword' scope", async () => {
    const { user } = await createUserWithWorkspace();
    const found = await User.scope('withPassword').findByPk(user.id);
    expect(found.passwordHash).toMatch(/^\$2b\$12\$/);
    expect(found.email).toBe(user.email); // the other columns are still there
  });

  it('strips passwordHash from toJSON even when the instance has it', async () => {
    const { user } = await createUserWithWorkspace(); // User.create returns the hash
    expect(user.passwordHash).toBeDefined();
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(user)).not.toContain('passwordHash');
  });
});

it('maps camelCase attributes to snake_case columns, with joined_at for members', async () => {
  const { user, membership } = await createUserWithWorkspace();
  expect(membership.joinedAt).toBeInstanceOf(Date);

  const [row] = await sequelize.query('SELECT * FROM workspace_members WHERE user_id = :id', {
    replacements: { id: user.id },
    type: QueryTypes.SELECT,
  });
  expect(Object.keys(row).sort()).toEqual(
    ['id', 'joined_at', 'role', 'updated_at', 'user_id', 'workspace_id'].sort(),
  );
});

it('loads a workspace with its members and habits with their schedule days', async () => {
  const { user, workspace } = await createUserWithWorkspace();
  const habit = await createHabit({ workspace, user, frequencyType: 'weekdays' });
  await HabitScheduleDay.bulkCreate([1, 3, 5].map((weekday) => ({ habitId: habit.id, weekday })));

  const loaded = await Workspace.findByPk(workspace.id, {
    include: [
      { association: 'members' },
      { association: 'owner' },
      { association: 'habits', include: [{ association: 'scheduleDays' }] },
    ],
  });

  expect(loaded.owner.id).toBe(user.id);
  expect(loaded.members.map((member) => member.id)).toEqual([user.id]);
  // Default scope applies to included users too: no password hash leaks through a join.
  expect(loaded.members[0].get('passwordHash')).toBeUndefined();
  expect(loaded.habits[0].scheduleDays.map((day) => day.weekday).sort()).toEqual([1, 3, 5]);
});

it('stores startDate as a plain calendar date string', async () => {
  const { user, workspace } = await createUserWithWorkspace();
  const habit = await createHabit({ workspace, user, startDate: '2026-03-29' });
  const found = await Habit.findByPk(habit.id);
  // DATEONLY comes back as 'YYYY-MM-DD', with no timezone shift.
  expect(found.startDate).toBe('2026-03-29');
});
