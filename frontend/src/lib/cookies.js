/**
 * Reading cookies from page JavaScript. Only the csrf_token cookie is readable on purpose: the
 * session cookie (hf_session) is HttpOnly, so scripts (including injected ones) can't steal it.
 */

/**
 * Value of a cookie, or null when it isn't set.
 * @param {string} name
 * @returns {string | null}
 */
export function readCookie(name) {
  const prefix = `${name}=`;
  const found = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}
