/**
 * Date-range presets for the Analytics page, kept in the URL so a view can be bookmarked and
 * shared: ?range=7d|30d|90d|year|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&habit=<id>.
 *
 * All ranges end today (in the user's timezone) except "custom", which the API limits to 366 days
 * including both ends (CLAUDE.md §5).
 */
import { DateTime } from 'luxon';
import { isIsoDate } from '../../lib/dates.js';

export const RANGE_PRESETS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

export const MAX_RANGE_DAYS = 366;
const DAYS = { '7d': 7, '30d': 30, '90d': 90 };

/** Inclusive number of days from `from` to `to`. */
export function rangeLength(from, to) {
  return Math.round(DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days) + 1;
}

/**
 * Turns the URL parameters into a concrete range.
 * @param {URLSearchParams} params
 * @param {string} today user's today
 * @returns {{ preset: string, from: string, to: string, error: string | null }} an invalid custom
 *   range falls back to the last 30 days and explains why in `error`
 */
export function resolveRange(params, today) {
  const preset = params.get('range') ?? '30d';
  const end = DateTime.fromISO(today);
  if (preset in DAYS) {
    return {
      preset,
      from: end.minus({ days: DAYS[preset] - 1 }).toISODate(),
      to: today,
      error: null,
    };
  }
  if (preset === 'year')
    return { preset, from: end.startOf('year').toISODate(), to: today, error: null };
  if (preset === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    let error = null;
    if (!isIsoDate(from) || !isIsoDate(to)) error = 'Choose a start and an end date.';
    else if (from > to) error = 'The start date must be on or before the end date.';
    else if (rangeLength(from, to) > MAX_RANGE_DAYS)
      error = `Choose at most ${MAX_RANGE_DAYS} days.`;
    if (!error) return { preset, from, to, error };
    return { ...resolveRange(new URLSearchParams({ range: '30d' }), today), preset, error };
  }
  return resolveRange(new URLSearchParams({ range: '30d' }), today);
}
