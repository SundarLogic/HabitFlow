/**
 * Request schemas for /api/v1/auth routes, applied by validate() in routes/authRoutes.js.
 * Unknown fields are stripped, so e.g. a `passwordHash` sent by a client is simply ignored.
 */
import { z } from 'zod';
import {
  emailSchema,
  existingPasswordSchema,
  nameSchema,
  newPasswordSchema,
  timezoneSchema,
} from './common.js';

/** POST /auth/signup */
export const signupBody = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  timezone: timezoneSchema.default('UTC'),
});

/** POST /auth/login. No password-strength rules here: old passwords must keep working. */
export const loginBody = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
});
