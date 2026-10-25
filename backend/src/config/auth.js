/**
 * Authentication settings shared by services, middleware and cookie helpers (CLAUDE.md §3.1).
 *
 * Values that differ per deployment (session lifetime, Secure cookies) come from env.js; the
 * rest are fixed security rules, kept in one place so they are easy to review.
 */
import { env } from './env.js';

/** Cookie holding the opaque session token (HttpOnly: JavaScript can't read it). */
export const SESSION_COOKIE = 'hf_session';
/** Cookie holding the CSRF token (NOT HttpOnly: the SPA reads it and echoes it in a header). */
export const CSRF_COOKIE = 'csrf_token';
/** Header the SPA must send on unsafe requests, matching the csrf_token cookie. */
export const CSRF_HEADER = 'X-CSRF-Token';
/** Header that selects the active workspace (defaults to the personal one). */
export const WORKSPACE_HEADER = 'X-Workspace-Id';

/** How long a session lives after its last (recorded) use. */
export const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
/**
 * Sliding expiry is recorded at most this often. Without it, EVERY request would write to the
 * sessions table just to bump a timestamp.
 */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** bcrypt work factor. Each +1 doubles hashing time; 12 is ~250 ms on a modern CPU. */
export const BCRYPT_COST = 12;

/** Login/signup: 10 attempts per 15 minutes per IP + email. */
export const AUTH_RATE_LIMIT = Object.freeze({ windowMs: 15 * 60 * 1000, limit: 10 });
/** Everything under /api: 300 requests per 15 minutes per IP. */
export const API_RATE_LIMIT = Object.freeze({ windowMs: 15 * 60 * 1000, limit: 300 });
