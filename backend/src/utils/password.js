/**
 * Password hashing (bcrypt) used by signup, login, password change and account deletion.
 *
 * Why the SHA-256 "pre-hash" (ADR-030)? bcrypt silently ignores everything after 72 bytes. We
 * allow passwords up to 128 characters (and non-ASCII characters can take 4 bytes each), so two
 * long passwords sharing their first 72 bytes would both be accepted. Hashing first with
 * SHA-256 and base64-encoding gives bcrypt a fixed 44-character input that depends on the
 * WHOLE password. The demo seeder repeats this logic (it is CommonJS and can't import this file).
 */
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { BCRYPT_COST } from '../config/auth.js';

/**
 * A real cost-12 bcrypt hash of a random value nobody knows. Login compares against it when the
 * email doesn't exist, so "unknown email" takes as long as "wrong password" and response times
 * don't reveal which emails are registered.
 */
const DUMMY_HASH = '$2b$12$OoU1/8pD7qJTsSEQqhXdI.NMvmj7140wWcARPq5gjriirwBQvtUZ6';

/** sha256(password) as base64: always 44 ASCII characters, well under bcrypt's 72-byte limit. */
function prehash(password) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('base64');
}

/**
 * Hashes a password for storage in users.password_hash.
 * @param {string} password plain text
 * @returns {Promise<string>} bcrypt hash (includes its own random salt)
 */
export function hashPassword(password) {
  return bcrypt.hash(prehash(password), BCRYPT_COST);
}

/**
 * Checks a password against a stored hash. Pass `null` as the hash when the user doesn't exist:
 * the dummy hash is compared instead and the result is always false, in the same time.
 * @param {string} password plain text
 * @param {string | null | undefined} hash bcrypt hash from the database
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  const matches = await bcrypt.compare(prehash(password), hash ?? DUMMY_HASH);
  return matches && Boolean(hash);
}
