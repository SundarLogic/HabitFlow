/**
 * csrfProtection: double-submit-cookie CSRF check (ADR-003). Place it AFTER requireAuth:
 *
 *   router.patch('/me', requireAuth, csrfProtection, validate(...), controller.update);
 *
 * The attack it stops: a malicious site makes the victim's browser send a request to our API,
 * and the browser attaches our cookies automatically. The defence: on unsafe requests the SPA
 * must ALSO copy the csrf_token cookie into the X-CSRF-Token header. Another site can make the
 * browser SEND our cookies but can't READ them, so it can't produce a matching header.
 *
 * Skipped for:
 *   - safe methods (GET/HEAD/OPTIONS), which must never change data anyway;
 *   - Bearer-authenticated requests: browsers never add an Authorization header on their own,
 *     so those requests can't be forged cross-site.
 */
import { CSRF_COOKIE, CSRF_HEADER } from '../config/auth.js';
import { ForbiddenError } from '../utils/AppError.js';
import { safeEqual } from '../utils/tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Express middleware; see the file header. */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method) || req.authMethod === 'bearer') {
    next();
    return;
  }
  // safeEqual is constant-time and returns false when either value is missing.
  if (!safeEqual(req.cookies?.[CSRF_COOKIE], req.get(CSRF_HEADER))) {
    throw new ForbiddenError('Missing or invalid CSRF token', { code: 'CSRF_TOKEN_INVALID' });
  }
  next();
}
