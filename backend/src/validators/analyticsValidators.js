/**
 * Query schemas for /analytics/* and GET /habits/:id/history, applied by validate().
 *
 * Ranges are optional here (each endpoint has a default range, applied by analyticsService
 * because it depends on "today" in the user's timezone), but when given:
 *   - from and to must be sent together,
 *   - from <= to and at most 366 days (CLAUDE.md §5).
 */
import { z } from 'zod';
import { daysBetween } from '../domain/dates.js';
import { isoDateSchema, MAX_RANGE_DAYS } from './common.js';

/** Adds "from and to together, ordered, at most 366 days" to a schema with optional from/to. */
function optionalRange(schema) {
  return schema.superRefine((query, ctx) => {
    const hasFrom = query.from !== undefined;
    const hasTo = query.to !== undefined;
    if (hasFrom !== hasTo) {
      ctx.addIssue({
        code: 'custom',
        path: [hasFrom ? 'to' : 'from'],
        message: 'from and to must be given together',
      });
      return;
    }
    if (!hasFrom) return;
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

const rangeFields = { from: isoDateSchema.optional(), to: isoDateSchema.optional() };

/** GET /analytics/summary?from&to&habitId&includeArchived (default: the last 30 days) */
export const summaryQuery = optionalRange(
  z.object({
    ...rangeFields,
    habitId: z.uuid({ message: 'must be a UUID' }).optional(),
    // Archived habits are part of history by default; includeArchived=false hides them.
    includeArchived: z
      .enum(['true', 'false'], { message: 'must be "true" or "false"' })
      .default('true')
      .transform((value) => value === 'true'),
  }),
);

/** GET /analytics/heatmap?year=YYYY or ?from&to (default: the current year) */
export const heatmapQuery = optionalRange(
  z.object({
    ...rangeFields,
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
).superRefine((query, ctx) => {
  if (query.year !== undefined && query.from !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['year'], message: 'use either year or from/to' });
  }
});

/** GET /habits/:id/history?from&to (default: the last 30 days) */
export const habitHistoryQuery = optionalRange(z.object(rangeFields));
