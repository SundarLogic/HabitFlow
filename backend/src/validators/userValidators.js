/**
 * Request schemas for /api/v1/users/me routes, applied by validate() in routes/userRoutes.js.
 */
import { z } from 'zod';
import { existingPasswordSchema, nameSchema, newPasswordSchema, timezoneSchema } from './common.js';

/** PATCH /users/me: every field optional, but at least one must be sent. */
export const updateMeBody = z
  .object({
    name: nameSchema.optional(),
    timezone: timezoneSchema.optional(),
    // .strict() rejects unknown preference keys instead of silently storing nothing.
    notificationPreferences: z
      .object({ inApp: z.boolean().optional(), reminders: z.boolean().optional() })
      .strict()
      .optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'provide at least one of name, timezone, notificationPreferences',
  });

/** PATCH /users/me/password */
export const changePasswordBody = z.object({
  currentPassword: existingPasswordSchema,
  newPassword: newPasswordSchema,
});

/** DELETE /users/me: the password, re-typed to confirm. */
export const deleteMeBody = z.object({ password: existingPasswordSchema });
