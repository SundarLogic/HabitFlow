/**
 * Request schemas for /api/v1/habits routes, applied by validate() in routes/habitRoutes.js.
 *
 * Two kinds of rules:
 *   - Field rules (types, lengths, formats): checked here by Zod.
 *   - Cross-field rules ("weekdays required for weekdays habits, forbidden otherwise", same for
 *     targetPerWeek): in habitStateIssues(). Create runs it here because the body is the whole
 *     habit. Update can't, because a PATCH body is only part of the habit: habitService merges
 *     it with the stored habit and runs habitStateIssues() on the result.
 * Rules that need "today" in the user's timezone (startDate default and its 1-year limit) are
 * applied in habitService, which has the user and the clock.
 */
import { z } from 'zod';
import { FREQUENCY_TYPES, HABIT_STATUSES } from '../models/constants.js';
import { isoDateSchema, paginationQuery } from './common.js';

/**
 * Optional free text: trimmed, '' becomes null (so "clear this field" can be sent either way).
 * @param {number} max maximum length after trimming
 */
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `must be at most ${max} characters`)
    .transform((value) => (value === '' ? null : value))
    .nullable();

const weekdays = z
  .array(z.number().int().min(1, 'must be 1-7').max(7, 'must be 1-7'))
  .min(1, 'must contain at least one weekday')
  .refine((days) => new Set(days).size === days.length, 'must not contain duplicates');

const targetPerWeek = z.number().int().min(1, 'must be 1-7').max(7, 'must be 1-7');

/** Fields shared by create and update. Everything is optional here; create adds requirements. */
const habitFields = {
  name: z.string().trim().min(1, 'is required').max(100, 'must be at most 100 characters'),
  description: optionalText(500),
  category: optionalText(50),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'must be a hex colour like #3B82F6')
    .nullable(),
  icon: optionalText(50),
  frequencyType: z.enum(FREQUENCY_TYPES),
  weekdays: weekdays.nullable(),
  targetPerWeek: targetPerWeek.nullable(),
  startDate: isoDateSchema,
};

/**
 * Cross-field schedule rules, used by create (below) and update (habitService, on the merged
 * state). Pure function so both paths enforce exactly the same rules.
 *
 * @param {{ frequencyType: string, weekdays?: number[] | null, targetPerWeek?: number | null }} state
 * @returns {{ path: string, message: string }[]} empty when valid
 */
export function habitStateIssues({ frequencyType, weekdays: days, targetPerWeek: target }) {
  const issues = [];
  if (frequencyType === 'weekdays') {
    if (!Array.isArray(days) || days.length === 0) {
      issues.push({ path: 'weekdays', message: 'is required for weekdays habits' });
    }
  } else if (days !== null && days !== undefined) {
    issues.push({ path: 'weekdays', message: 'is only allowed for weekdays habits' });
  }
  if (frequencyType === 'weekly_target') {
    if (target === null || target === undefined) {
      issues.push({ path: 'targetPerWeek', message: 'is required for weekly_target habits' });
    }
  } else if (target !== null && target !== undefined) {
    issues.push({ path: 'targetPerWeek', message: 'is only allowed for weekly_target habits' });
  }
  return issues;
}

/** POST /habits */
export const createHabitBody = z
  .object({
    name: habitFields.name,
    description: habitFields.description.optional(),
    category: habitFields.category.optional(),
    color: habitFields.color.optional(),
    icon: habitFields.icon.optional(),
    frequencyType: habitFields.frequencyType,
    weekdays: habitFields.weekdays.optional(),
    targetPerWeek: habitFields.targetPerWeek.optional(),
    startDate: habitFields.startDate.optional(), // default (today in user tz) set by the service
  })
  .superRefine((body, ctx) => {
    for (const issue of habitStateIssues(body)) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  });

/**
 * PATCH /habits/:id: any subset of the fields, plus `status` (archive / unarchive).
 * Cross-field rules are checked by habitService on the merged result.
 */
export const updateHabitBody = z
  .object({
    name: habitFields.name.optional(),
    description: habitFields.description.optional(),
    category: habitFields.category.optional(),
    color: habitFields.color.optional(),
    icon: habitFields.icon.optional(),
    frequencyType: habitFields.frequencyType.optional(),
    weekdays: habitFields.weekdays.optional(),
    targetPerWeek: habitFields.targetPerWeek.optional(),
    startDate: habitFields.startDate.optional(),
    status: z.enum(HABIT_STATUSES).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'provide at least one field to update',
  });

/** :id in /habits/:id. A malformed id is a 422, never a 500 from Postgres. */
export const habitIdParams = z.object({ id: z.uuid({ message: 'must be a UUID' }) });

/** GET /habits?status=&category=&search=&page=&limit= */
export const listHabitsQuery = paginationQuery.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  category: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

/** DELETE /habits/:id?permanent=true|false (default false = archive). */
export const deleteHabitQuery = z.object({
  // Query values are strings; z.coerce.boolean() would turn "false" into true, so map explicitly.
  permanent: z
    .enum(['true', 'false'], { message: 'must be "true" or "false"' })
    .default('false')
    .transform((value) => value === 'true'),
});

/** PATCH /habits/reorder: the new sortOrder of some or all habits. */
export const reorderHabitsBody = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid({ message: 'must be a UUID' }),
        sortOrder: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1, 'must contain at least one habit')
    .max(1000)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      'must not list the same habit twice',
    ),
});
