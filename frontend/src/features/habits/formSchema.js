/**
 * Habit form: validation (mirrors the API rules in CLAUDE.md "Habit management") and the
 * conversions between a habit, the form's values and the API payload.
 *
 * Form values always hold every field (weekdays, targetPerWeek, ...) so switching the frequency
 * back and forth keeps what the user already picked; only the fields that apply are sent.
 */
import { DateTime } from 'luxon';
import { z } from 'zod';
import { isIsoDate } from '../../lib/dates.js';
import { MAX_REMINDERS } from './constants.js';

const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} can be at most ${max} characters`);

/**
 * @param {{ today: string }} context today in the user's timezone (start date may be at most a
 *   year after it)
 */
export function habitFormSchema({ today }) {
  const latestStart = DateTime.fromISO(today).plus({ years: 1 }).toISODate();
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Give your habit a name')
        .max(100, 'Use at most 100 characters'),
      description: optionalText(500, 'Description'),
      category: optionalText(50, 'Category'),
      color: z.string().regex(/^(#[0-9A-Fa-f]{6})?$/, 'Pick a colour'),
      icon: z.string().max(50),
      frequencyType: z.enum(['daily', 'weekdays', 'weekly_target']),
      weekdays: z.array(z.number().int().min(1).max(7)),
      targetPerWeek: z.coerce
        .number({ message: 'Enter a number from 1 to 7' })
        .int('Enter a whole number')
        .min(1, 'At least 1 time per week')
        .max(7, 'At most 7 times per week'),
      startDate: z
        .string()
        .refine(isIsoDate, 'Choose a start date')
        .refine((d) => d <= latestStart, `Start on or before ${latestStart}`),
      reminders: z
        .array(
          z.object({
            id: z.string().optional(),
            remindAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a time'),
          }),
        )
        .max(MAX_REMINDERS, `At most ${MAX_REMINDERS} reminders`),
    })
    .superRefine((values, ctx) => {
      if (values.frequencyType === 'weekdays' && values.weekdays.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'Pick at least one day' });
      }
      const times = values.reminders.map((r) => r.remindAt);
      times.forEach((time, index) => {
        if (time && times.indexOf(time) !== index) {
          ctx.addIssue({
            code: 'custom',
            path: ['reminders', index, 'remindAt'],
            message: 'You already have a reminder at this time',
          });
        }
      });
    });
}

/**
 * Initial form values: from an existing habit (edit) or sensible defaults (create).
 * @param {object | null} habit
 * @param {{ today: string, reminders?: object[] }} context
 */
export function toFormValues(habit, { today, reminders = [] }) {
  return {
    name: habit?.name ?? '',
    description: habit?.description ?? '',
    category: habit?.category ?? '',
    color: habit?.color ?? '#4F46E5',
    icon: habit?.icon ?? '',
    frequencyType: habit?.frequencyType ?? 'daily',
    weekdays: habit?.weekdays ?? [1, 2, 3, 4, 5],
    targetPerWeek: habit?.targetPerWeek ?? 3,
    startDate: habit?.startDate ?? today,
    reminders: reminders.map((r) => ({ id: r.id, remindAt: r.remindAt })),
  };
}

/**
 * The POST/PATCH body: empty strings become null, and only the schedule fields that apply to the
 * chosen frequency are sent (the API rejects weekdays on a daily habit, for example).
 */
export function toApiPayload(values) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    category: values.category.trim() || null,
    color: values.color || null,
    icon: values.icon || null,
    frequencyType: values.frequencyType,
    weekdays:
      values.frequencyType === 'weekdays' ? [...values.weekdays].sort((a, b) => a - b) : null,
    targetPerWeek: values.frequencyType === 'weekly_target' ? Number(values.targetPerWeek) : null,
    startDate: values.startDate,
  };
}

/** Labels for server field errors (applyServerErrors). */
export const HABIT_FIELD_LABELS = {
  name: 'Name',
  description: 'Description',
  category: 'Category',
  color: 'Colour',
  icon: 'Icon',
  frequencyType: 'Frequency',
  weekdays: 'Days',
  targetPerWeek: 'Times per week',
  startDate: 'Start date',
};
