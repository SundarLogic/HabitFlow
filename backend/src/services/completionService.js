/**
 * Completion service: mark / unmark a habit for a date, and the completion history
 * (PRD 4.3, CLAUDE.md §3.1 "Completable-date rules").
 *
 * Request flow: habitRoutes / completionRoutes -> validators -> completionController -> THIS FILE.
 * Every lookup is scoped to the active workspace; another workspace's habit is a 404.
 *
 * A completion belongs to (habit, user, date): the DB allows exactly one per triple (ADR-005).
 */
import { Op, QueryTypes } from 'sequelize';
import { todayIn } from '../domain/dates.js';
import { isScheduledOn } from '../domain/schedule.js';
import { Habit, HabitCompletion, HabitScheduleDay, sequelize } from '../models/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError.js';
import { now as systemNow } from '../utils/clock.js';
import { notifyStreakMilestone } from './milestoneService.js';

/**
 * The habit (in this workspace) with its weekdays, read-locked for the rest of the transaction.
 * FOR SHARE lets many completions proceed together but makes a concurrent archive or delete
 * wait, so a habit can't be archived between our checks and our insert.
 */
async function findHabitForCompletion(workspaceId, habitId, transaction) {
  const habit = await Habit.findOne({
    where: { id: habitId, workspaceId },
    transaction,
    lock: transaction.LOCK.SHARE,
  });
  if (!habit) throw new NotFoundError('Habit not found');
  const days = await HabitScheduleDay.findAll({ where: { habitId }, transaction });
  return { habit, weekdays: days.map((day) => day.weekday) };
}

/** History of archived habits is read-only (CLAUDE.md §3.1). */
function assertActive(habit) {
  if (habit.status !== 'active') {
    throw new ConflictError('Archived habits are read-only; restore the habit first', {
      code: 'HABIT_ARCHIVED',
    });
  }
}

/**
 * Marks a habit done on a date. Idempotent and race-safe:
 *   - INSERT ... ON CONFLICT DO NOTHING never fails on a duplicate. When two requests race, the
 *     second one waits for the first to commit, then inserts nothing.
 *   - We then SELECT the row, which exists either way.
 * `created` tells the controller to answer 201 (new) or 200 (already done).
 * If a `note` is sent for an existing completion, the note is updated (PUT sets the state).
 * A new completion that makes the current streak reach 7/30/100/365 also creates a
 * 'streak_milestone' notification (milestoneService).
 *
 * Rules, checked in this order:
 *   404 NOT_FOUND            habit not in this workspace
 *   409 HABIT_ARCHIVED       habit archived
 *   422 DATE_NOT_COMPLETABLE date after today (user tz) or before startDate; details.reason is
 *                            DATE_IN_FUTURE or BEFORE_START_DATE
 *   422 DATE_NOT_SCHEDULED   a weekdays habit on a day it doesn't run (weekly_target: any day)
 *
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string }, habitId: string,
 *   date: string, note?: string | null, now?: () => Date }} params
 * @returns {Promise<{ completion: HabitCompletion, created: boolean }>}
 */
export function markCompletion({ workspace, user, habitId, date, note, now = systemNow }) {
  return sequelize.transaction(async (transaction) => {
    const { habit, weekdays } = await findHabitForCompletion(workspace.id, habitId, transaction);
    assertActive(habit);

    const today = todayIn(user.timezone, now);
    if (date > today) {
      throw new ValidationError('Cannot complete a habit for a future date', {
        code: 'DATE_NOT_COMPLETABLE',
        details: { reason: 'DATE_IN_FUTURE', today },
      });
    }
    if (date < habit.startDate) {
      throw new ValidationError('Cannot complete a habit before its start date', {
        code: 'DATE_NOT_COMPLETABLE',
        details: { reason: 'BEFORE_START_DATE', startDate: habit.startDate },
      });
    }
    if (!isScheduledOn(habit, weekdays, date)) {
      throw new ValidationError('The habit is not scheduled on this date', {
        code: 'DATE_NOT_SCHEDULED',
        details: { weekdays },
      });
    }

    const completedAt = now();
    // Raw SQL because Sequelize can't express "ON CONFLICT ON CONSTRAINT ... DO NOTHING
    // RETURNING" and report whether a row was inserted. Values go in as bound replacements.
    const inserted = await sequelize.query(
      `INSERT INTO habit_completions
         (id, habit_id, completed_by, completion_date, completed_at, note, created_at, updated_at)
       VALUES (gen_random_uuid(), :habitId, :userId, :date, :completedAt, :note, :completedAt, :completedAt)
       ON CONFLICT ON CONSTRAINT habit_completions_habit_user_date_unique DO NOTHING
       RETURNING id`,
      {
        replacements: { habitId, userId: user.id, date, completedAt, note: note ?? null },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const created = inserted.length === 1;

    let completion = await HabitCompletion.findOne({
      where: { habitId, completedBy: user.id, completionDate: date },
      transaction,
    });
    if (!created && note !== undefined && completion.note !== note) {
      completion = await completion.update({ note }, { transaction });
    }
    // Only a NEW completion can lengthen a streak, so only then look for a milestone.
    if (created) {
      await notifyStreakMilestone({
        habit,
        scheduleDays: weekdays,
        user,
        date,
        today,
        transaction,
      });
    }
    return { completion, created };
  });
}

/**
 * Removes the user's completion of a habit on a date. Idempotent: succeeds whether or not a
 * completion existed. Archived habits are read-only (409); unknown habits are 404.
 * @param {{ workspace: { id: string }, user: { id: string }, habitId: string, date: string }} params
 */
export async function unmarkCompletion({ workspace, user, habitId, date }) {
  await sequelize.transaction(async (transaction) => {
    const { habit } = await findHabitForCompletion(workspace.id, habitId, transaction);
    assertActive(habit);
    await HabitCompletion.destroy({
      where: { habitId, completedBy: user.id, completionDate: date },
      transaction,
    });
  });
}

/**
 * The user's completions in this workspace between two dates (inclusive), newest first,
 * including archived habits (history stays queryable). Optionally for one habit only.
 * @param {{ workspace: { id: string }, user: { id: string }, from: string, to: string,
 *   habitId?: string, page: number, limit: number }} params range already validated (<= 366 days)
 * @returns {Promise<{ completions: HabitCompletion[], total: number }>}
 * @throws {NotFoundError} when habitId is given but isn't in this workspace
 */
export async function listHistory({ workspace, user, from, to, habitId, page, limit }) {
  if (habitId) {
    const habit = await Habit.findOne({ where: { id: habitId, workspaceId: workspace.id } });
    if (!habit) throw new NotFoundError('Habit not found');
  }

  const { rows, count } = await HabitCompletion.findAndCountAll({
    where: {
      completedBy: user.id,
      completionDate: { [Op.between]: [from, to] },
      ...(habitId ? { habitId } : {}),
    },
    // The JOIN restricts results to habits of THIS workspace without returning habit columns.
    include: [{ association: 'habit', attributes: [], where: { workspaceId: workspace.id } }],
    order: [
      ['completionDate', 'DESC'],
      ['completedAt', 'DESC'],
      ['id', 'ASC'],
    ],
    limit,
    offset: (page - 1) * limit,
  });
  return { completions: rows, total: count };
}
