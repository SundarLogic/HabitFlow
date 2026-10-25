/**
 * Safe "return to" handling for login redirects (/login?returnTo=/habits/123).
 *
 * The value comes from the URL, so an attacker could craft /login?returnTo=https://evil.example.
 * Only same-site paths are accepted: they must start with a single "/" (not "//", which browsers
 * treat as another host) and not contain a backslash (some browsers read "/\evil" as "//evil").
 */

/**
 * @param {string | null | undefined} value
 * @param {string} [fallback='/']
 * @returns {string} a safe in-app path
 */
export function safeReturnTo(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

/**
 * The login URL that brings the user back to `path` afterwards.
 * @param {string} path current path + search, e.g. '/habits?status=all'
 * @returns {string}
 */
export function loginUrl(path) {
  const returnTo = safeReturnTo(path, '/');
  return returnTo === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`;
}
