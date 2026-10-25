/**
 * Timezone helpers for the signup form and settings.
 */

/** The browser's IANA timezone, e.g. 'Europe/Lisbon' (falls back to UTC). */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** All IANA zones the browser knows (empty in very old browsers without supportedValuesOf). */
function knownZones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/**
 * Every IANA timezone the browser knows, A-Z, always including UTC and `current`
 * (so a saved or detected value is never missing from the list).
 * @param {string} [current]
 * @returns {string[]}
 */
export function timezoneOptions(current) {
  return [...new Set([...knownZones(), 'UTC', ...(current ? [current] : [])])].sort();
}
