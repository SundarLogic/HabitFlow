/**
 * requireAuth: the gate in front of every protected route.
 *
 *   router.get('/me', requireAuth, ...);
 *
 * It finds the session token in the hf_session cookie, or else in an
 * `Authorization: Bearer <token>` header (the future mobile app), and asks authService for the
 * session. On success it sets:
 *   req.user        the User (without passwordHash)
 *   req.session     the Session row
 *   req.authMethod  'cookie' | 'bearer' (csrfProtection only checks cookie requests)
 * Otherwise the request stops with 401 UNAUTHENTICATED.
 */
import { SESSION_COOKIE } from '../config/auth.js';
import { resolveSession } from '../services/authService.js';
import { UnauthorizedError } from '../utils/AppError.js';
import { now as systemNow } from '../utils/clock.js';
import { setSessionCookie } from '../utils/cookies.js';

/** Extracts the token from "Bearer <token>" (scheme is case-insensitive per RFC 6750). */
function bearerToken(header) {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1] : undefined;
}

/** Express middleware; see the file header. Async errors reach the error handler (Express 5). */
export async function requireAuth(req, res, next) {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  // The cookie wins when both are present, so CSRF checks can't be skipped by adding a header.
  const token = cookieToken || bearerToken(req.get('Authorization'));
  const authMethod = cookieToken ? 'cookie' : 'bearer';

  // createApp({ now }) lets tests control the clock.
  const now = req.app.locals.now ?? systemNow;
  const result = await resolveSession(token, { now });
  if (!result) throw new UnauthorizedError();

  // Sliding expiry moved expires_at, so extend the cookie's lifetime to match.
  if (result.refreshed && authMethod === 'cookie') {
    setSessionCookie(res, { token, expiresAt: result.session.expiresAt, now: now() });
  }

  req.user = result.user;
  req.session = result.session;
  req.authMethod = authMethod;
  next();
}
