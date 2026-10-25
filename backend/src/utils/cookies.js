/**
 * Setting and clearing the auth cookies (hf_session + csrf_token). Used by the auth/user
 * controllers and the requireAuth middleware, so the flags are defined exactly once.
 *
 * Flags (CLAUDE.md §3.1):
 *   HttpOnly   hf_session only: page JavaScript (and therefore XSS) can't read the session.
 *              csrf_token must be readable, because the SPA copies it into X-CSRF-Token.
 *   Secure     sent only over HTTPS (COOKIE_SECURE; always on in production).
 *   SameSite   Lax: not sent on cross-site POST/PUT/PATCH/DELETE, a first line of CSRF defence.
 *   Path=/     sent to every path of the API.
 */
import { CSRF_COOKIE, SESSION_COOKIE } from '../config/auth.js';
import { env } from '../config/env.js';
import { generateToken } from './tokens.js';

const BASE_OPTIONS = Object.freeze({ secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' });

/** Milliseconds from now until `expiresAt`, for the cookie's Max-Age. */
function maxAgeUntil(expiresAt, now) {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * Sets (or refreshes) the session cookie so it expires together with the session row.
 * @param {import('express').Response} res
 * @param {{ token: string, expiresAt: Date, now: Date }} session
 */
export function setSessionCookie(res, { token, expiresAt, now }) {
  res.cookie(SESSION_COOKIE, token, {
    ...BASE_OPTIONS,
    httpOnly: true,
    maxAge: maxAgeUntil(expiresAt, now),
  });
}

/**
 * Sets the CSRF cookie. Pass no token to generate a fresh one.
 * @param {import('express').Response} res
 * @param {{ token?: string, maxAge: number }} options
 * @returns {string} the token that was set
 */
export function setCsrfCookie(res, { token = generateToken(), maxAge }) {
  res.cookie(CSRF_COOKIE, token, { ...BASE_OPTIONS, httpOnly: false, maxAge });
  return token;
}

/**
 * After signup/login: a new session cookie and a NEW CSRF token. Rotating the CSRF token at
 * login means a token planted before login (e.g. on a shared computer) stops working.
 * @param {import('express').Response} res
 * @param {{ token: string, expiresAt: Date, now: Date }} session
 */
export function setAuthCookies(res, session) {
  setSessionCookie(res, session);
  setCsrfCookie(res, { maxAge: maxAgeUntil(session.expiresAt, session.now) });
}

/**
 * Logout / account deletion: tells the browser to delete both cookies. The options must match
 * the ones used to set them (path etc.), or the browser keeps the old cookie.
 * @param {import('express').Response} res
 */
export function clearAuthCookies(res) {
  res.clearCookie(SESSION_COOKIE, { ...BASE_OPTIONS, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...BASE_OPTIONS, httpOnly: false });
}
