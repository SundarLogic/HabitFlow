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

/** Parses a date that MUST be valid, or throws (inputs are validated before reaching here). */
function requireDate(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date.isValid) throw new RangeError(`Invalid calendar date: ${isoDate}`);
  return date;
}

/**
 * Moves a calendar date by whole days: addDays('2024-02-28', 1) -> '2024-02-29'.
 * Works on dates, not instants, so DST changes can't shift the result.
 * @param {string} isoDate
 * @param {number} days may be negative
 * @returns {string}
 */
export function addDays(isoDate, days) {
  return requireDate(isoDate).plus({ days }).toISODate();
}

/**
 * Whole days from `from` to `to` (negative if `to` is earlier): daysBetween('2026-10-19',
 * '2026-10-25') -> 6.
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function daysBetween(from, to) {
  return Math.round(requireDate(to).diff(requireDate(from), 'days').days);
}

/**
 * The ISO week (Monday-Sunday, ADR-006) containing a date.
 * @param {string} isoDate
 * @returns {{ start: string, end: string }} Monday and Sunday as 'YYYY-MM-DD'
 */
export function weekBounds(isoDate) {
  const date = requireDate(isoDate);
  // Luxon weeks are ISO weeks (Monday first) regardless of the server locale.
  return { start: date.startOf('week').toISODate(), end: date.endOf('week').toISODate() };
}

/**
 * Every date from `from` to `to`, both included: eachDay('2026-10-30', '2026-11-02') ->
 * ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']. Empty when from > to.
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
export function eachDay(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * The current wall-clock time in a timezone as 'HH:mm' (24-hour), e.g. for reminder times.
 * @param {string} timezone IANA zone
 * @param {() => Date} now clock
 * @returns {string}
 */
export function localTimeIn(timezone, now) {
  return DateTime.fromJSDate(now()).setZone(timezone).toFormat('HH:mm');
}
