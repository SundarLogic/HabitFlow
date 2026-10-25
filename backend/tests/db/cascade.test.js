/**
 * Foreign-key ON DELETE behaviour (the retention policy in CLAUDE.md §3.1):
 *   - permanently deleting a habit removes its schedule days, completions and reminders, leaving
 *     no orphans (ON DELETE CASCADE);
 *   - other habits' rows are untouched;
 *   - a user who still owns a workspace can't be deleted by accident (ON DELETE RESTRICT).
 */
import { ForeignKeyConstraintError } from 'sequelize';
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
import { createHabit, createUserWithWorkspace } from '../helpers/factories.js';

/** Inserts one schedule day, one completion and one reminder for `habit`. */
async function addChildRows(habit, user) {
  await HabitScheduleDay.create({ habitId: habit.id, weekday: 1 });
  await HabitCompletion.create({
    habitId: habit.id,
    completedBy: user.id,
    completionDate: '2026-03-02',
  });
  await HabitReminder.create({ habitId: habit.id, userId: user.id, remindAt: '08:00' });
}

beforeEach(async () => {
  await truncateAllTables();
});

it('deleting a habit cascades to its schedule days, completions and reminders only', async () => {
  const { user, workspace } = await createUserWithWorkspace();
  const doomed = await createHabit({ workspace, user, frequencyType: 'weekdays' });
  const kept = await createHabit({ workspace, user, frequencyType: 'weekdays', name: 'Keep me' });
  await addChildRows(doomed, user);
  await addChildRows(kept, user);

  await doomed.destroy();

  for (const Child of [HabitScheduleDay, HabitCompletion, HabitReminder]) {
    expect(await Child.count({ where: { habitId: doomed.id } })).toBe(0);
    expect(await Child.count({ where: { habitId: kept.id } })).toBe(1);
  }
});

it('deleting a workspace cascades to its members, habits and their history', async () => {
  const { user, workspace } = await createUserWithWorkspace();
  const habit = await createHabit({ workspace, user });
  await addChildRows(habit, user);

  await workspace.destroy();

  expect(await WorkspaceMember.count()).toBe(0);
  expect(await Habit.count()).toBe(0);
  expect(await HabitCompletion.count()).toBe(0);
  // The user account itself survives.
  expect(await User.count()).toBe(1);
});

it('refuses to delete a user who still owns a workspace', async () => {
  const { user } = await createUserWithWorkspace();
  await expect(user.destroy()).rejects.toThrow(ForeignKeyConstraintError);

  // Deleting the workspace first (as future account deletion will) then works.
  await Workspace.destroy({ where: { ownerUserId: user.id } });
  await user.destroy();
  expect(await User.count()).toBe(0);
});
