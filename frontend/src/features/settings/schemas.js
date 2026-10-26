/**
 * Client-side validation for the settings forms, mirroring the backend rules (CLAUDE.md §3.1).
 * The server validates again; its errors are shown under the fields.
 */
import { z } from 'zod';
import { signupSchema } from '../auth/schemas.js';
import { timezoneOptions } from '../../lib/timezones.js';

export const profileSchema = z.object({
  name: signupSchema.shape.name,
});

/**
 * The typed zone must be one the browser knows (the API checks it again with Luxon). Browsers
 * without Intl.supportedValuesOf only know UTC, so they let the server decide.
 */
export const timezoneSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1, 'Choose a timezone')
    .refine((value) => {
      const zones = timezoneOptions();
      return zones.length <= 1 || zones.includes(value);
    }, 'Pick a timezone from the list, like Europe/Lisbon'),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: signupSchema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: "The passwords don't match",
  });

/** Confirmation word for deleting the account. */
export const DELETE_WORD = 'DELETE';

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password'),
  confirm: z.literal(DELETE_WORD, { message: `Type ${DELETE_WORD} in capital letters to confirm` }),
});
