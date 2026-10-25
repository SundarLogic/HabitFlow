/**
 * Calendar-date helpers (pure functions, no database).
 *
 * HabitFlow stores calendar days as 'YYYY-MM-DD' strings (DATEONLY). Two such strings compare
 * correctly with < and > because the format is zero-padded and goes year -> month -> day.
 *
 * "Today" always depends on the USER's timezone (CLAUDE.md §3.1): at 23:30 in New York it is
 * already tomorrow in UTC. Never use the server's local date for business logic.
 */
import { DateTime } from 'luxon';

const ISO_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses 'YYYY-MM-DD' as a pure calendar date. UTC is used only as a neutral container: it has
 * no DST, so adding days never lands on a missing or repeated hour.
 * @param {string} isoDate
 * @returns {DateTime} an invalid DateTime if the string isn't a real date
 */
export function parseIsoDate(isoDate) {
  if (typeof isoDate !== 'string' || !ISO_DATE_FORMAT.test(isoDate)) {
    return DateTime.invalid('not in YYYY-MM-DD format');
  }
  return DateTime.fromISO(isoDate, { zone: 'utc' });
}

/**
 * True for a real calendar date in 'YYYY-MM-DD' form ('2024-02-29' yes, '2023-02-29' no).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIsoDate(value) {
  return parseIsoDate(value).isValid;
}

/**
 * Today's date in a timezone, as 'YYYY-MM-DD'.
 * @param {string} timezone IANA zone, e.g. 'America/New_York'
 * @param {() => Date} now clock (inject a fixed one in tests)
 * @returns {string}
 */
export function todayIn(timezone, now) {
  return DateTime.fromJSDate(now()).setZone(timezone).toISODate();
}

/**
 * Adds a Luxon duration to a calendar date, e.g. addToDate('2024-02-29', { years: 1 }) ->
 * '2025-02-28' (Luxon clamps to the last valid day of the month).
 * @param {string} isoDate
 * @param {import('luxon').DurationLike} duration
 * @returns {string}
 */
export function addToDate(isoDate, duration) {
  return parseIsoDate(isoDate).plus(duration).toISODate();
}

/**
 * ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday (NOT Date.getDay(), Sunday = 0).
 * @param {string} isoDate
 * @returns {number}
 * @throws {RangeError} for an invalid date (a programming error: inputs are validated earlier)
 */
export function isoWeekday(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date.isValid) throw new RangeError(`Invalid calendar date: ${isoDate}`);
  return date.weekday;
}
