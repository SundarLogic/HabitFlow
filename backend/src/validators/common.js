/**
 * Zod building blocks shared by several validator files.
 */
import { IANAZone } from 'luxon';
import { z } from 'zod';
import { daysBetween, isValidIsoDate } from '../domain/dates.js';

/**
 * `?page=1&limit=20` (CLAUDE.md §5). Query values arrive as strings, so z.coerce turns "2" into 2.
 * Out-of-range values are rejected (422), not clamped.
 */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Email, trimmed and lowercased BEFORE the format check, so " Ana@X.com " is accepted as "ana@x.com". */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'must be at most 254 characters')
  .pipe(z.email({ message: 'must be a valid email address' }));

/** A display name: 1-100 characters after trimming. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(100, 'must be at most 100 characters');

/** An IANA timezone such as "Europe/Paris", checked with Luxon (CLAUDE.md §3.1). */
export const timezoneSchema = z
  .string()
  .refine(
    (value) => IANAZone.isValidZone(value),
    'must be a valid IANA timezone, e.g. "Europe/Paris"',
  );

/** Rules for NEW passwords (signup, password change). Login accepts any non-empty string. */
export const newPasswordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(128, 'must be at most 128 characters')
  .regex(/\p{L}/u, 'must contain at least one letter') // \p{L} = any letter, incl. é, ß, 中
  .regex(/\p{N}/u, 'must contain at least one number');

/** An existing password typed for confirmation. The max length only bounds hashing work. */
export const existingPasswordSchema = z.string().min(1, 'is required').max(128);

/** A calendar date 'YYYY-MM-DD' that really exists ('2026-02-30' is rejected). */
export const isoDateSchema = z
  .string()
  .refine(isValidIsoDate, 'must be a real calendar date in YYYY-MM-DD format');

/** Longest allowed ?from=&to= range, in days, both ends included (CLAUDE.md §5). */
export const MAX_RANGE_DAYS = 366;

/**
 * Adds the CLAUDE.md §5 date-range rules to a query schema that has `from` and `to`:
 * from <= to, and at most 366 days including both ends. Bounded ranges protect the database.
 * @param {import('zod').ZodObject} schema
 */
export function withDateRange(schema) {
  return schema.superRefine((query, ctx) => {
    if (query.from > query.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'must be on or before `to`' });
    } else if (daysBetween(query.from, query.to) + 1 > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `range must be at most ${MAX_RANGE_DAYS} days`,
      });
    }
  });
}
