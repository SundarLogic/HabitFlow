/**
 * Calendar-date helpers for the UI (Luxon). Dates are 'YYYY-MM-DD' strings, exactly as the API
 * sends them, and "today" is ALWAYS the user's today in their own timezone (users.timezone),
 * never the browser's: someone travelling still sees their home calendar until they change it.
 */
import { DateTime } from 'luxon';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real date like '2026-10-28' ('2026-02-30' is false). */
export function isIsoDate(value) {
  return typeof value === 'string' && ISO_DATE.test(value) && DateTime.fromISO(value).isValid;
}

/**
 * Today's date in a timezone.
 * @param {string} [timezone] IANA zone; falls back to the browser's zone
 * @returns {string}
 */
export function todayIn(timezone) {
  const now = DateTime.now();
  return (timezone ? now.setZone(timezone) : now).toISODate();
}

/** addDays('2026-10-28', -1) -> '2026-10-27'. */
export function addDays(isoDate, days) {
  return DateTime.fromISO(isoDate).plus({ days }).toISODate();
}

/** "Wednesday, October 28" (in the browser's language). */
export function longDate(isoDate) {
  return DateTime.fromISO(isoDate).toLocaleString({
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** "Wed" */
export function shortWeekday(isoDate) {
  return DateTime.fromISO(isoDate).toLocaleString({ weekday: 'short' });
}

/** The Sunday ending the ISO week (Mon-Sun) that contains `isoDate`. */
export function weekEnd(isoDate) {
  return DateTime.fromISO(isoDate).endOf('week').toISODate();
}

/** Relative label for the date heading: 'Today', 'Yesterday', 'Tomorrow' or null. */
export function relativeDayLabel(isoDate, today) {
  const diff = DateTime.fromISO(isoDate).diff(DateTime.fromISO(today), 'days').days;
  return { 0: 'Today', [-1]: 'Yesterday', 1: 'Tomorrow' }[Math.round(diff)] ?? null;
}
