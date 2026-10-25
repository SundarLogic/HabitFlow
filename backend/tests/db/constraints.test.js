/**
 * Database constraint tests: the schema itself must reject bad data, even if a future bug
 * lets it slip past the services and models.
 *
 * To test the DATABASE rule rather than the model validator in front of it, the "DB" cases
 * pass `{ validate: false }`, which makes Sequelize skip model validation and send the INSERT
 * as-is. The "model" cases show the same rule caught earlier, with a readable message.
 *
 * How Sequelize reports Postgres errors:
 *   UNIQUE violation -> UniqueConstraintError (err.original.constraint = constraint name)
 *   CHECK violation  -> DatabaseError with err.original.code '23514'
 */
import { DatabaseError, UniqueConstraintError, ValidationError } from 'sequelize';
import {
  Habit,
  HabitCompletion,
  HabitReminder,
  HabitScheduleDay,
  User,
  Workspace,
  WorkspaceMember,
} from '../../src/models/index.js';
import { truncateAllTables } from '../helpers/db.js';
import { createHabit, createUser, createUserWithWorkspace } from '../helpers/factories.js';

/** Awaits `promise`, expecting it to fail, and returns the error. */
async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to fail');
}

/** Asserts that `promise` fails on the Postgres CHECK constraint called `constraint`. */
async function expectCheckViolation(promise, constraint) {
  const err = await rejectionOf(promise);
  expect(err).toBeInstanceOf(DatabaseError);
  expect(err.original).toMatchObject({ code: '23514', constraint });
}

/** Asserts that `promise` fails on the UNIQUE constraint (or unique index) called `constraint`. */
async function expectUniqueViolation(promise, constraint) {
  const err = await rejectionOf(promise);
  expect(err).toBeInstanceOf(UniqueConstraintError);
  expect(err.original.constraint).toBe(constraint);
}

beforeEach(async () => {
  await truncateAllTables();
});

describe('users', () => {
  it('rejects a duplicate email', async () => {
    await createUser({ email: 'same@example.com' });
    await expectUniqueViolation(createUser({ email: 'same@example.com' }), 'users_email_unique');
  });

  it('treats emails case-insensitively (the model lowercases before saving)', async () => {
    const user = await createUser({ email: '  Mixed.Case@Example.COM ' });
    expect(user.email).toBe('mixed.case@example.com');
    await expectUniqueViolation(
      createUser({ email: 'MIXED.case@example.com' }),
      'users_email_unique',
    );
  });

  it('DB rejects an uppercase email written without the model setter', async () => {
    await expectCheckViolation(
      User.sequelize.query(
        "INSERT INTO users (name, email, password_hash) VALUES ('X', 'Upper@Example.com', 'h')",
      ),
      'users_email_lowercase',
    );
  });

  it('defaults timezone and notification preferences, and validates the timezone', async () => {
    const user = await createUser();
    await user.reload();
    expect(user.timezone).toBe('UTC');
    expect(user.notificationPreferences).toEqual({ inApp: true, reminders: true });

    await expect(createUser({ timezone: 'Mars/Olympus_Mons' })).rejects.toThrow(ValidationError);
  });
});

describe('workspaces and membership', () => {
  it('rejects a duplicate membership of the same user in the same workspace', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    await expectUniqueViolation(
      WorkspaceMember.create({ workspaceId: workspace.id, userId: user.id, role: 'member' }),
      'workspace_members_workspace_user_unique',
    );
  });

  it('allows only one personal workspace per owner, but any number of team workspaces', async () => {
    const { user } = await createUserWithWorkspace();
    const second = { name: 'Another', ownerUserId: user.id, workspaceType: 'personal' };
    await expectUniqueViolation(Workspace.create(second), 'workspaces_one_personal_per_owner');

    const team = { name: 'Team', ownerUserId: user.id, workspaceType: 'team' };
    await Workspace.create(team);
    await expect(Workspace.create({ ...team, name: 'Team 2' })).resolves.toBeDefined();
  });

  it('rejects an unknown role and workspace type', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    const other = await createUser();
    await expectCheckViolation(
      WorkspaceMember.create(
        { workspaceId: workspace.id, userId: other.id, role: 'superuser' },
        { validate: false },
      ),
      'workspace_members_role_valid',
    );
    await expectCheckViolation(
      Workspace.create(
        { name: 'X', ownerUserId: user.id, workspaceType: 'galaxy' },
        { validate: false },
      ),
      'workspaces_workspace_type_valid',
    );
  });
});

describe('habit_completions', () => {
  it('rejects a second completion for the same habit, user and date', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    const habit = await createHabit({ workspace, user });
    const completion = { habitId: habit.id, completedBy: user.id, completionDate: '2026-03-10' };

    await HabitCompletion.create(completion);
    await expectUniqueViolation(
      HabitCompletion.create(completion),
      'habit_completions_habit_user_date_unique',
    );
    // A different date is fine.
    await expect(
      HabitCompletion.create({ ...completion, completionDate: '2026-03-11' }),
    ).resolves.toBeDefined();
  });
});

describe('habit_schedule_days', () => {
  it.each([0, 8, -1])('DB rejects weekday %i (ISO weekdays are 1-7)', async (weekday) => {
    const { user, workspace } = await createUserWithWorkspace();
    const habit = await createHabit({ workspace, user, frequencyType: 'weekdays' });
    await expectCheckViolation(
      HabitScheduleDay.create({ habitId: habit.id, weekday }, { validate: false }),
      'habit_schedule_days_weekday_range',
    );
  });

  it('model rejects an invalid weekday before reaching the DB', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    const habit = await createHabit({ workspace, user, frequencyType: 'weekdays' });
    await expect(HabitScheduleDay.create({ habitId: habit.id, weekday: 8 })).rejects.toThrow(
      ValidationError,
    );
  });

  it('accepts 1 (Monday) and 7 (Sunday) but not the same weekday twice', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    const habit = await createHabit({ workspace, user, frequencyType: 'weekdays' });
    await HabitScheduleDay.bulkCreate([
      { habitId: habit.id, weekday: 1 },
      { habitId: habit.id, weekday: 7 },
    ]);
    await expectUniqueViolation(
      HabitScheduleDay.create({ habitId: habit.id, weekday: 7 }),
      'habit_schedule_days_habit_weekday_unique',
    );
  });
});

describe('habits target_per_week CHECK', () => {
  const CONSTRAINT = 'habits_target_per_week_matches_frequency';

  it.each([
    ['weekly_target', null],
    ['weekly_target', 0],
    ['weekly_target', 8],
    ['daily', 3],
    ['weekdays', 1],
  ])('DB rejects frequency %s with target_per_week %p', async (frequencyType, targetPerWeek) => {
    const { user, workspace } = await createUserWithWorkspace();
    await expectCheckViolation(
      createHabitUnvalidated({ workspace, user, frequencyType, targetPerWeek }),
      CONSTRAINT,
    );
  });

  it.each([
    ['weekly_target', 1],
    ['weekly_target', 7],
    ['daily', null],
    ['weekdays', null],
  ])('DB accepts frequency %s with target_per_week %p', async (frequencyType, targetPerWeek) => {
    const { user, workspace } = await createUserWithWorkspace();
    await expect(
      createHabitUnvalidated({ workspace, user, frequencyType, targetPerWeek }),
    ).resolves.toBeDefined();
  });

  it('model rejects the same mistakes with a readable message', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    await expect(
      createHabit({ workspace, user, frequencyType: 'weekly_target', targetPerWeek: null }),
    ).rejects.toThrow(/targetPerWeek must be 1-7/);
    await expect(
      createHabit({ workspace, user, frequencyType: 'daily', targetPerWeek: 2 }),
    ).rejects.toThrow(/only allowed for weekly_target/);
  });

  /** Inserts a habit bypassing model validation, so only the DB constraints apply. */
  function createHabitUnvalidated({ workspace, user, ...fields }) {
    return Habit.create(
      {
        workspaceId: workspace.id,
        createdBy: user.id,
        name: 'Run',
        startDate: '2026-01-01',
        ...fields,
      },
      { validate: false },
    );
  }
});

describe('habits other CHECKs', () => {
  it('requires archived_at exactly when status is archived', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    const base = {
      workspaceId: workspace.id,
      createdBy: user.id,
      name: 'X',
      startDate: '2026-01-01',
    };
    await expectCheckViolation(
      Habit.create({ ...base, frequencyType: 'daily', status: 'archived' }, { validate: false }),
      'habits_archived_at_matches_status',
    );
    await expectCheckViolation(
      Habit.create(
        { ...base, frequencyType: 'daily', status: 'active', archivedAt: new Date() },
        { validate: false },
      ),
      'habits_archived_at_matches_status',
    );
  });

  it('rejects an unknown frequency type', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    await expectCheckViolation(
      Habit.create(
        {
          workspaceId: workspace.id,
          createdBy: user.id,
          name: 'X',
          startDate: '2026-01-01',
          frequencyType: 'monthly',
        },
        { validate: false },
      ),
      'habits_frequency_type_valid',
    );
  });
});

describe('habit_reminders weekdays CHECK', () => {
  it.each([[[]], [[0]], [[1, 8]]])('DB rejects weekdays %j', async (weekdays) => {
    const { user, workspace } = await createUserWithWorkspace();
    const habit = await createHabit({ workspace, user });
    await expectCheckViolation(
      HabitReminder.create(
        { habitId: habit.id, userId: user.id, remindAt: '08:00', weekdays },
        { validate: false },
      ),
      'habit_reminders_weekdays_valid',
    );
  });

  it('accepts null (every scheduled day) and a valid list', async () => {
    const { user, workspace } = await createUserWithWorkspace();
    const habit = await createHabit({ workspace, user });
    await HabitReminder.create({ habitId: habit.id, userId: user.id, remindAt: '08:00' });
    const reminder = await HabitReminder.create({
      habitId: habit.id,
      userId: user.id,
      remindAt: '20:30',
      weekdays: [1, 7],
    });
    await reminder.reload();
    expect(reminder.weekdays).toEqual([1, 7]);
    expect(reminder.remindAt).toBe('20:30:00');
  });
});
