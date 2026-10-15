/**
 * Clock provider: the one place the app asks "what time is it?".
 *
 * Why not call `new Date()` directly everywhere? Because tests need to control time.
 * Services accept a `now` function parameter that defaults to this one. A test can pass
 * `() => new Date('2026-03-29T01:30:00Z')` to check behaviour on a specific moment
 * (e.g. a daylight-saving change or the last day of a week).
 *
 * This returns an instant in time (internally UTC). For calendar questions like
 * "what is TODAY for this user?", convert it to the user's timezone with Luxon:
 *   DateTime.fromJSDate(now()).setZone(user.timezone).toISODate()
 * Never use the server's local time for business logic (see CLAUDE.md §3).
 *
 * @returns {Date}
 */
export function now() {
  return new Date();
}
