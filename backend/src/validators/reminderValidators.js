/**
 * Request schemas for habit reminders, applied by validate() in routes/habitRoutes.js
 * (list/create under /habits/:id/reminders) and routes/reminderRoutes.js (/reminders/:id).
 *
 * Rules that need the habit (weekdays must fit a `weekdays` habit's schedule, max 5 per habit)
 * are checked in reminderService.
 */
import { z } from 'zod';

/** 'HH:mm', 24-hour, in the user's timezone. Seconds are not accepted (reminders are per minute). */
const remindAt = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time like 07:30');

const weekdays = z
  .array(z.number().int().min(1, 'must be 1-7').max(7, 'must be 1-7'))
  .min(1, 'must contain at least one weekday (or be null for every scheduled day)')
  .refine((days) => new Set(days).size === days.length, 'must not contain duplicates');

/** POST /habits/:id/reminders. weekdays null/omitted = every scheduled day of the habit. */
export const createReminderBody = z.object({
  remindAt,
  weekdays: weekdays.nullable().optional(),
  enabled: z.boolean().default(true),
});

/** PATCH /reminders/:id: any subset, at least one field. */
export const updateReminderBody = z
  .object({
    remindAt: remindAt.optional(),
    weekdays: weekdays.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'provide at least one of remindAt, weekdays, enabled',
  });

/** :id in /reminders/:id */
export const reminderIdParams = z.object({ id: z.uuid({ message: 'must be a UUID' }) });
