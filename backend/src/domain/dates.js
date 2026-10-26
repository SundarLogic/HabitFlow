/**
 * Calendar-date helpers (pure functions, no database).
 *
 * HabitFlow stores calendar days as 'YYYY-MM-DD' strings (DATEONLY). Two such strings compare
 * correctly with < and > because the format is zero-padded and goes year -> month -> day.
 *
 * "Today" always depends on the USER's timezone (CLAUDE.md §3.1): at 23:30 in New York it is
 * already tomorrow in UTC. Never use the server's local date for business logic.
 *
 * Performance (Phase 11, ADR-051): the streak and analytics engines call addDays / isoWeekday /
 * weekBounds hundreds of thousands of times for a long history (50 habits x 2 years). Creating a
 * Luxon DateTime per call made GET /today take ~1 s, so those helpers work on plain DAY NUMBERS
 * (days since 1970-01-01) with integer arithmetic. Luxon is kept where a real timezone is
 * involved (todayIn, localTimeIn) and for month/year arithmetic (addToDate).
 */
import { DateTime } from 'luxon';

const ISO_DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in each month of a non-leap year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Days since 1970-01-01 of a Gregorian calendar date. This is Howard Hinnant's
 * "days_from_civil" algorithm: exact for every year, with no Date object (and so no timezone or
 * DST) involved. It counts in 400-year "eras", which repeat exactly in the Gregorian calendar.
 */
function dayNumberFromCivil(y, m, d) {
  const year = m <= 2 ? y - 1 : y; // the algorithm starts years in March
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400; // 0..399
  const dayOfYear = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1; // 0..365
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468; // 719468 = days from 0000-03-01 to 1970-01-01
}

/** The inverse ("civil_from_days"): day number -> 'YYYY-MM-DD'. */
function isoFromDayNumber(n) {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153); // month, counted from March = 0
  const d = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yearOfEra + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' -> day number, or null if it isn't a real calendar date in exactly that form. */
function toDayNumber(isoDate) {
  const match = typeof isoDate === 'string' ? ISO_DATE_FORMAT.exec(isoDate) : null;
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  const monthLength = m === 2 && isLeapYear(y) ? 29 : MONTH_DAYS[m - 1];
  if (d > monthLength) return null;
  return dayNumberFromCivil(y, m, d);
}

/**
 * Memo of valid date strings -> day numbers. A request walks the same few thousand dates many
 * times, so parsing each once saves most of the regex work. Pure (same input, same output), and
 * cleared when it gets large so memory stays bounded.
 */
const dayNumbers = new Map();
const MEMO_LIMIT = 50_000;

/** Day number of a date that MUST be valid, or throws (inputs are validated before reaching here). */
function requireDayNumber(isoDate) {
  const cached = dayNumbers.get(isoDate);
  if (cached !== undefined) return cached;
  const n = toDayNumber(isoDate);
  if (n === null) throw new RangeError(`Invalid calendar date: ${isoDate}`);
  if (dayNumbers.size >= MEMO_LIMIT) dayNumbers.clear();
  dayNumbers.set(isoDate, n);
  return n;
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a day number; day 0, 1970-01-01, was a Thursday. */
const weekdayOf = (n) => ((((n + 3) % 7) + 7) % 7) + 1;

/**
 * Parses 'YYYY-MM-DD' as a pure calendar date. UTC is used only as a neutral container: it has
 * no DST, so adding days never lands on a missing or repeated hour.
 * @param {string} isoDate
 * @returns {DateTime} an invalid DateTime if the string isn't a real date
 */
export function parseIsoDate(isoDate) {
  if (toDayNumber(isoDate) === null) return DateTime.invalid('not a YYYY-MM-DD calendar date');
  return DateTime.fromISO(isoDate, { zone: 'utc' });
}

/**
 * True for a real calendar date in 'YYYY-MM-DD' form ('2024-02-29' yes, '2023-02-29' no).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIsoDate(value) {
  return toDayNumber(value) !== null;
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
  return weekdayOf(requireDayNumber(isoDate));
}

/**
 * Moves a calendar date by whole days: addDays('2024-02-28', 1) -> '2024-02-29'.
 * Works on dates, not instants, so DST changes can't shift the result.
 * @param {string} isoDate
 * @param {number} days may be negative
 * @returns {string}
 */
export function addDays(isoDate, days) {
  return isoFromDayNumber(requireDayNumber(isoDate) + days);
}

/**
 * Whole days from `from` to `to` (negative if `to` is earlier): daysBetween('2026-10-19',
 * '2026-10-25') -> 6.
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function daysBetween(from, to) {
  return requireDayNumber(to) - requireDayNumber(from);
}

/**
 * The ISO week (Monday-Sunday, ADR-006) containing a date.
 * @param {string} isoDate
 * @returns {{ start: string, end: string }} Monday and Sunday as 'YYYY-MM-DD'
 */
export function weekBounds(isoDate) {
  const n = requireDayNumber(isoDate);
  const monday = n - (weekdayOf(n) - 1);
  return { start: isoFromDayNumber(monday), end: isoFromDayNumber(monday + 6) };
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
  const last = requireDayNumber(to);
  for (let n = requireDayNumber(from); n <= last; n += 1) days.push(isoFromDayNumber(n));
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
