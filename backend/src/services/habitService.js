/**
 * Habit service: create, read, update, archive, delete and reorder habits (PRD 4.2, CLAUDE.md
 * §3.1 "Schedules" and "Retention policy").
 *
 * Request flow: habitRoutes -> validators -> habitController -> THIS FILE -> models.
 *
 * Security rule: EVERY query filters by the active workspace id (from resolveWorkspace), and a
 * habit is always looked up by (id, workspaceId) together. A habit id from another workspace
 * therefore simply isn't found -> 404, and its existence is never revealed.
 */
import { Op } from 'sequelize';
import { addToDate, todayIn } from '../domain/dates.js';
import { Habit, HabitScheduleDay, sequelize } from '../models/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError.js';
import { now as systemNow } from '../utils/clock.js';
import { habitStateIssues } from '../validators/habitValidators.js';
import { assertCanCreateActiveHabit } from './entitlementService.js';

/** Loads the weekdays with every habit we return (needed by the serializer). */
const WITH_SCHEDULE = [{ association: 'scheduleDays', attributes: ['weekday'] }];
/** Fields an ARCHIVED habit may still change without being restored first. */
const ARCHIVED_EDITABLE = new Set(['name', 'description', 'status']);
/** Plain fields copied as-is from a create/update body. */
const SIMPLE_FIELDS = ['name', 'description', 'category', 'color', 'icon', 'startDate'];

/** Escapes LIKE wildcards so a search for "100%" matches the text "100%", not "100<anything>". */
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 422 in the same shape as validate() so clients handle schema and service errors alike. */
function validationError(issues) {
  return new ValidationError('Request validation failed', {
    details: issues.map((issue) => ({ location: 'body', ...issue })),
  });
}

/** startDate may be in the past (backfill) but at most 1 year after today in the user's tz. */
function assertStartDateAllowed(startDate, today) {
  const latest = addToDate(today, { years: 1 });
  if (startDate > latest) {
    throw validationError([
      { path: 'startDate', message: `must be on or before ${latest} (at most 1 year ahead)` },
    ]);
  }
}

/**
 * The habit with this id IN THIS WORKSPACE, or 404.
 * @param {string} workspaceId
 * @param {string} id
 * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
 *   lock = SELECT ... FOR UPDATE, so concurrent edits of one habit run one after the other
 */
async function findHabit(workspaceId, id, { transaction, lock } = {}) {
  const habit = await Habit.findOne({
    where: { id, workspaceId },
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!habit) throw new NotFoundError('Habit not found');
  return habit;
}

/** Re-reads a habit with its schedule days (after a write). */
function reloadWithSchedule(id, transaction) {
  return Habit.findByPk(id, { include: WITH_SCHEDULE, transaction });
}

/** Replaces a habit's schedule days with `weekdays` (or removes them all when null). */
async function replaceScheduleDays(habitId, weekdays, transaction) {
  await HabitScheduleDay.destroy({ where: { habitId }, transaction });
  if (weekdays?.length) {
    await HabitScheduleDay.bulkCreate(
      weekdays.map((weekday) => ({ habitId, weekday })),
      { transaction },
    );
  }
}

/**
 * Lists habits in a workspace, ordered by sortOrder then creation time.
 * @param {string} workspaceId
 * @param {{ status?: 'active' | 'archived' | 'all', category?: string, search?: string,
 *   page?: number, limit?: number }} [filters] search = case-insensitive substring of the name
 * @returns {Promise<{ habits: Habit[], total: number }>}
 */
export async function listHabits(
  workspaceId,
  { status = 'active', category, search, page = 1, limit = 20 } = {},
) {
  const where = { workspaceId };
  if (status !== 'all') where.status = status;
  if (category) where.category = category;
  if (search) where.name = { [Op.iLike]: `%${escapeLike(search)}%` };

  const { rows, count } = await Habit.findAndCountAll({
    where,
    include: WITH_SCHEDULE,
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'], // tie-breaker so pages are stable
    ],
    limit,
    offset: (page - 1) * limit,
    // Count habits, not habit x schedule-day rows produced by the JOIN.
    distinct: true,
  });
  return { habits: rows, total: count };
}

/**
 * One habit with its schedule, or 404 if it isn't in this workspace.
 * @param {string} workspaceId
 * @param {string} id
 * @returns {Promise<Habit>}
 */
export async function getHabit(workspaceId, id) {
  const habit = await Habit.findOne({ where: { id, workspaceId }, include: WITH_SCHEDULE });
  if (!habit) throw new NotFoundError('Habit not found');
  return habit;
}

/**
 * Creates a habit and its schedule days in one transaction, after the plan-limit check.
 * startDate defaults to today in the user's timezone. New habits go to the end of the list.
 *
 * @param {{ workspace: { id: string }, user: { id: string, timezone: string },
 *   input: object, now?: () => Date }} params input = validated createHabitBody
 * @returns {Promise<Habit>}
 * @throws {ForbiddenError} 403 PLAN_LIMIT_REACHED
 */
export async function createHabit({ workspace, user, input, now = systemNow }) {
  const today = todayIn(user.timezone, now);
  const startDate = input.startDate ?? today;
  assertStartDateAllowed(startDate, today);

  // The function is `async` so a failed startDate check above rejects the returned promise
  // instead of throwing synchronously; `return await` satisfies ESLint's require-await rule.
  return await sequelize.transaction(async (transaction) => {
    await assertCanCreateActiveHabit(workspace, { transaction });

    const maxSortOrder = await Habit.max('sortOrder', {
      where: { workspaceId: workspace.id },
      transaction,
    });
    const habit = await Habit.create(
      {
        workspaceId: workspace.id,
        createdBy: user.id,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        frequencyType: input.frequencyType,
        targetPerWeek: input.frequencyType === 'weekly_target' ? input.targetPerWeek : null,
        startDate,
        status: 'active',
        // Habit.max returns null for an empty workspace.
        sortOrder: (maxSortOrder ?? -1) + 1,
      },
      { transaction },
    );
    if (input.frequencyType === 'weekdays') {
      await replaceScheduleDays(habit.id, input.weekdays, transaction);
    }
    return reloadWithSchedule(habit.id, transaction);
  });
}

/**
 * Applies a PATCH. The body is merged with the stored habit and the RESULT is validated, so e.g.
 * switching to weekly_target without a targetPerWeek fails, while switching from weekly_target to
 * daily clears targetPerWeek automatically.
 *
 * Archived habits: only name/description may change, unless the same request restores the habit
 * (status: 'active'), which counts against the plan limit.
 *
 * @param {{ workspace: { id: string }, user: { timezone: string }, id: string,
 *   changes: object, now?: () => Date }} params changes = validated updateHabitBody
 * @returns {Promise<Habit>}
 * @throws {NotFoundError | ConflictError | ValidationError | ForbiddenError}
 */
export function updateHabit({ workspace, user, id, changes, now = systemNow }) {
  const provided = (key) => changes[key] !== undefined;

  return sequelize.transaction(async (transaction) => {
    const habit = await findHabit(workspace.id, id, { transaction, lock: true });
    const restoring = habit.status === 'archived' && changes.status === 'active';

    if (habit.status === 'archived' && !restoring) {
      const blocked = Object.keys(changes).filter((k) => provided(k) && !ARCHIVED_EDITABLE.has(k));
      if (blocked.length > 0) {
        throw new ConflictError('Archived habits can only be renamed or restored', {
          code: 'HABIT_ARCHIVED',
          details: { fields: blocked },
        });
      }
    }

    // --- Merge the PATCH with the stored schedule, then validate the final state ---
    const currentWeekdays = (
      await HabitScheduleDay.findAll({ where: { habitId: habit.id }, transaction })
    ).map((day) => day.weekday);
    const frequencyType = changes.frequencyType ?? habit.frequencyType;
    const keepsType = (type) => frequencyType === type && habit.frequencyType === type;
    // A value not sent in the body is carried over only while the type stays the same;
    // otherwise it no longer applies and is cleared.
    const weekdays = provided('weekdays')
      ? changes.weekdays
      : keepsType('weekdays')
        ? currentWeekdays
        : null;
    const targetPerWeek = provided('targetPerWeek')
      ? changes.targetPerWeek
      : keepsType('weekly_target')
        ? habit.targetPerWeek
        : null;

    const issues = habitStateIssues({ frequencyType, weekdays, targetPerWeek });
    if (issues.length > 0) throw validationError(issues);
    if (provided('startDate'))
      assertStartDateAllowed(changes.startDate, todayIn(user.timezone, now));

    // --- Build the update ---
    const updates = {
      frequencyType,
      targetPerWeek: frequencyType === 'weekly_target' ? targetPerWeek : null,
    };
    for (const field of SIMPLE_FIELDS) {
      if (provided(field)) updates[field] = changes[field];
    }
    if (restoring) {
      await assertCanCreateActiveHabit(workspace, { transaction });
      Object.assign(updates, { status: 'active', archivedAt: null });
    } else if (changes.status === 'archived' && habit.status === 'active') {
      Object.assign(updates, { status: 'archived', archivedAt: now() });
    }

    // Decide BEFORE saving: after update() the instance already holds the new frequencyType.
    const scheduleChanged = frequencyType !== habit.frequencyType || provided('weekdays');
    await habit.update(updates, { transaction });
    if (scheduleChanged) {
      await replaceScheduleDays(
        habit.id,
        frequencyType === 'weekdays' ? weekdays : null,
        transaction,
      );
    }
    return reloadWithSchedule(habit.id, transaction);
  });
}

/**
 * Archives a habit: it leaves active tracking but keeps its history. Idempotent: archiving an
 * archived habit changes nothing.
 * @param {{ workspace: { id: string }, id: string, now?: () => Date }} params
 * @returns {Promise<Habit>}
 */
export function archiveHabit({ workspace, id, now = systemNow }) {
  return sequelize.transaction(async (transaction) => {
    const habit = await findHabit(workspace.id, id, { transaction, lock: true });
    if (habit.status === 'active') {
      await habit.update({ status: 'archived', archivedAt: now() }, { transaction });
    }
    return reloadWithSchedule(habit.id, transaction);
  });
}

/**
 * Restores an archived habit, if the plan allows one more active habit. Idempotent.
 * @param {{ workspace: { id: string }, id: string }} params
 * @returns {Promise<Habit>}
 * @throws {ForbiddenError} 403 PLAN_LIMIT_REACHED
 */
export function unarchiveHabit({ workspace, id }) {
  return sequelize.transaction(async (transaction) => {
    const habit = await findHabit(workspace.id, id, { transaction, lock: true });
    if (habit.status === 'archived') {
      await assertCanCreateActiveHabit(workspace, { transaction });
      await habit.update({ status: 'active', archivedAt: null }, { transaction });
    }
    return reloadWithSchedule(habit.id, transaction);
  });
}

/**
 * DELETE /habits/:id (retention policy, ADR-010):
 *   permanent = false  archive (history kept)
 *   permanent = true   hard delete, only for an ALREADY archived habit (two deliberate steps
 *                      against accidental data loss). Schedule days, completions and reminders
 *                      go with it through ON DELETE CASCADE, in one transaction: no orphans.
 * @param {{ workspace: { id: string }, id: string, permanent: boolean, now?: () => Date }} params
 * @throws {ConflictError} 409 HABIT_NOT_ARCHIVED
 */
export async function removeHabit({ workspace, id, permanent, now = systemNow }) {
  if (!permanent) {
    await archiveHabit({ workspace, id, now });
    return;
  }
  await sequelize.transaction(async (transaction) => {
    const habit = await findHabit(workspace.id, id, { transaction, lock: true });
    if (habit.status !== 'archived') {
      throw new ConflictError('Archive the habit before deleting it permanently', {
        code: 'HABIT_NOT_ARCHIVED',
      });
    }
    await habit.destroy({ transaction });
  });
}

/**
 * Sets sortOrder for several habits at once (drag-and-drop). All-or-nothing: if ANY id is not in
 * this workspace, nothing changes and the answer is 404.
 * @param {{ workspace: { id: string }, items: { id: string, sortOrder: number }[] }} params
 */
export async function reorderHabits({ workspace, items }) {
  await sequelize.transaction(async (transaction) => {
    const ids = items.map((item) => item.id);
    const found = await Habit.count({ where: { workspaceId: workspace.id, id: ids }, transaction });
    if (found !== ids.length) throw new NotFoundError('Habit not found');

    for (const { id, sortOrder } of items) {
      await Habit.update({ sortOrder }, { where: { id, workspaceId: workspace.id }, transaction });
    }
  });
}

/**
 * The distinct categories used by habits in this workspace (active and archived), A-Z.
 * @param {string} workspaceId
 * @returns {Promise<string[]>}
 */
export async function listCategories(workspaceId) {
  const rows = await Habit.findAll({
    attributes: ['category'],
    where: { workspaceId, category: { [Op.ne]: null } },
    group: ['category'],
    order: [['category', 'ASC']],
    raw: true,
  });
  return rows.map((row) => row.category);
}
