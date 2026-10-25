/**
 * Random tokens and safe comparisons for sessions and CSRF (CLAUDE.md §3.1).
 *
 * Session tokens: the raw token goes to the client (cookie or Bearer header); the database only
 * ever sees sha256(token). If the sessions table leaks, the hashes can't be used to log in.
 */
import crypto from 'node:crypto';

/**
 * Creates an unguessable token: 32 random bytes, base64url-encoded (43 URL/cookie-safe chars).
 * @returns {string}
 */
export function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * SHA-256 of a token as 64 lowercase hex characters (the format of sessions.token_hash).
 * A fast hash is fine here, unlike for passwords: the token is already 256 random bits, so
 * there is nothing to brute-force.
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Compares two strings in constant time, so an attacker can't learn how many leading characters
 * of a guessed token were right by measuring response times.
 *
 * crypto.timingSafeEqual throws when the inputs differ in length, so both sides are hashed
 * first: equal-length digests, and the length of the secret isn't revealed either.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean} false if either value is not a non-empty string
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}
