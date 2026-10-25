/**
 * Reminder service: the user's reminder times for a habit (PRD 4.6).
 *
 * Request flow: habitRoutes / reminderRoutes -> validators -> reminderController -> THIS FILE.
 *
 * Scoping: a reminder belongs to ONE user (habit_reminders.user_id) and is only reachable through
 * a habit in the active workspace. Someone else's reminder, or one in another workspace, is a 404.
 * Sending reminders is done by reminderDispatchService (run every minute by the scheduler).
 */
import { UniqueConstraintError } from 'sequelize';
import { Habit, HabitReminder, HabitScheduleDay, sequelize } from '../models/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError.js';

/** Product limit: reminders per habit per user. */
export const MAX_REMINDERS_PER_HABIT = 5;

/** 'HH:mm' (API) -> 'HH:mm:00' (TIME column). */
const toDbTime = (hhmm) => `${hhmm}:00`;

/** For a `weekdays` habit, reminder weekdays must be days the habit actually runs on. */
async function assertWeekdaysFitSchedule(habit, weekdays, transaction) {
  if (habit.frequencyType !== 'weekdays' || !weekdays) return;
  const allowed = (await HabitScheduleDay.findAll({ where: { habitId: habit.id }, transaction }))
    .map((day) => day.weekday)
    .sort((a, b) => a - b);
  const outside = weekdays.filter((day) => !allowed.includes(day));
  if (outside.length > 0) {
    throw new ValidationError('Reminder weekdays must be days the habit is scheduled on', {
      code: 'REMINDER_WEEKDAYS_NOT_SCHEDULED',
      details: { allowed, outside },
    });
  }
}

/** Runs `write`, turning the UNIQUE(habit, user, time) violation into a clear 409. */
async function withDuplicateCheck(write) {
  try {
    return await write();
  } catch (err) {
    if (
      err instanceof UniqueConstraintError &&
      err.original?.constraint === 'habit_reminders_habit_user_time_unique'
    ) {
      throw new ConflictError('You already have a reminder at this time for this habit', {
        code: 'REMINDER_DUPLICATE',
      });
    }
    throw err;
  }
}

/**
 * The habit in this workspace, or 404.
 * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
 */
async function findHabit(workspaceId, habitId, { transaction, lock } = {}) {
  const habit = await Habit.findOne({
    where: { id: habitId, workspaceId },
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!habit) throw new NotFoundError('Habit not found');
  return habit;
}

/** The user's reminder, reachable only through a habit of the active workspace, or 404. */
async function findReminder(workspaceId, userId, reminderId, transaction) {
  const reminder = await HabitReminder.findOne({
    where: { id: reminderId, userId },
    include: [{ association: 'habit', where: { workspaceId }, required: true }],
    transaction,
  });
  if (!reminder) throw new NotFoundError('Reminder not found');
  return reminder;
}

/**
 * The requesting user's reminders for a habit, earliest time first.
 * @param {{ workspace: { id: string }, user: { id: string }, habitId: string }} params
 * @returns {Promise<HabitReminder[]>}
 */
export async function listReminders({ workspace, user, habitId }) {
  await findHabit(workspace.id, habitId);
  return HabitReminder.findAll({
    where: { habitId, userId: user.id },
    order: [['remindAt', 'ASC']],
  });
}

/**
 * Adds a reminder. Rules: habit active (409 HABIT_ARCHIVED), at most 5 per habit
 * (422 REMINDER_LIMIT_REACHED), weekdays within a weekdays habit's schedule
 * (422 REMINDER_WEEKDAYS_NOT_SCHEDULED), one reminder per time (409 REMINDER_DUPLICATE).
 * The habit row is locked so two simultaneous requests can't both pass the limit check.
 *
 * @param {{ workspace: { id: string }, user: { id: string }, habitId: string,
 *   input: { remindAt: string, weekdays?: number[] | null, enabled: boolean } }} params
 * @returns {Promise<HabitReminder>}
 */
export function createReminder({ workspace, user, habitId, input }) {
  return sequelize.transaction(async (transaction) => {
    const habit = await findHabit(workspace.id, habitId, { transaction, lock: true });
    if (habit.status !== 'active') {
      throw new ConflictError('Archived habits cannot get new reminders', {
        code: 'HABIT_ARCHIVED',
      });
    }
    const count = await HabitReminder.count({
      where: { habitId, userId: user.id },
      transaction,
    });
    if (count >= MAX_REMINDERS_PER_HABIT) {
      throw new ValidationError(`A habit can have at most ${MAX_REMINDERS_PER_HABIT} reminders`, {
        code: 'REMINDER_LIMIT_REACHED',
        details: { limit: MAX_REMINDERS_PER_HABIT },
      });
    }
    await assertWeekdaysFitSchedule(habit, input.weekdays, transaction);

    return withDuplicateCheck(() =>
      HabitReminder.create(
        {
          habitId,
          userId: user.id,
          remindAt: toDbTime(input.remindAt),
          weekdays: input.weekdays ?? null,
          enabled: input.enabled,
        },
        { transaction },
      ),
    );
  });
}

/**
 * Changes time, weekdays (null = every scheduled day) and/or enabled.
 * @param {{ workspace: { id: string }, user: { id: string }, reminderId: string,
 *   changes: { remindAt?: string, weekdays?: number[] | null, enabled?: boolean } }} params
 * @returns {Promise<HabitReminder>}
 */
export function updateReminder({ workspace, user, reminderId, changes }) {
  return sequelize.transaction(async (transaction) => {
    const reminder = await findReminder(workspace.id, user.id, reminderId, transaction);
    if (changes.weekdays !== undefined) {
      await assertWeekdaysFitSchedule(reminder.habit, changes.weekdays, transaction);
    }
    const updates = {};
    if (changes.remindAt !== undefined) updates.remindAt = toDbTime(changes.remindAt);
    if (changes.weekdays !== undefined) updates.weekdays = changes.weekdays;
    if (changes.enabled !== undefined) updates.enabled = changes.enabled;
    return withDuplicateCheck(() => reminder.update(updates, { transaction }));
  });
}

/**
 * Deletes one of the user's reminders (404 if it isn't theirs / in this workspace).
 * @param {{ workspace: { id: string }, user: { id: string }, reminderId: string }} params
 */
export async function deleteReminder({ workspace, user, reminderId }) {
  const reminder = await findReminder(workspace.id, user.id, reminderId);
  await reminder.destroy();
}
