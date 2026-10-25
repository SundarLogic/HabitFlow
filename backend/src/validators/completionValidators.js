/**
 * Request schemas for completions, history and the daily overview, applied by validate() in
 * routes/habitRoutes.js, routes/completionRoutes.js and routes/todayRoutes.js.
 */
import { z } from 'zod';
import { isoDateSchema, paginationQuery, withDateRange } from './common.js';

/** PUT/DELETE /habits/:id/completions/:date */
export const completionParams = z.object({
  id: z.uuid({ message: 'must be a UUID' }),
  date: isoDateSchema,
});

/**
 * PUT body: an optional note. The body itself may be missing (a plain "mark done"), which
 * express.json() leaves as undefined, so it defaults to {}.
 */
export const markCompletionBody = z
  .object({
    note: z
      .string()
      .trim()
      .max(280, 'must be at most 280 characters')
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
  })
  .optional()
  .transform((body) => body ?? {});

/** GET /completions?from=&to=&habitId=&page=&limit= (from/to required, at most 366 days) */
export const historyQuery = withDateRange(
  paginationQuery.extend({
    from: isoDateSchema,
    to: isoDateSchema,
    habitId: z.uuid({ message: 'must be a UUID' }).optional(),
  }),
);

/** GET /today?date= (defaults to today in the user's timezone) */
export const todayQuery = z.object({ date: isoDateSchema.optional() });
