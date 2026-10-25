/**
 * Auth controller: the HTTP layer for /api/v1/auth. Each handler reads validated input, calls a
 * service, sets cookies and shapes the JSON. No business rules and no database access here.
 *
 * Users are always sent through toPublicUser() so password hashes can never leak.
 */
import { CSRF_COOKIE, SESSION_TTL_MS } from '../config/auth.js';
import { toPublicUser } from '../serializers/user.js';
import { toPublicWorkspace } from '../serializers/workspace.js';
import * as authService from '../services/authService.js';
import * as userService from '../services/userService.js';
import { now as systemNow } from '../utils/clock.js';
import { clearAuthCookies, setAuthCookies, setCsrfCookie } from '../utils/cookies.js';

/** A token we issued: 32 random bytes in base64url = 43 characters. */
const CSRF_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** Client details stored on the new session (for a future "active devices" screen). */
function clientInfo(req) {
  return { userAgent: req.get('User-Agent'), ip: req.ip };
}

/** The app clock (tests inject a fixed one via createApp({ now })). */
function clock(req) {
  return req.app.locals.now ?? systemNow;
}

/** POST /auth/signup -> 201 { user } + hf_session and csrf_token cookies */
export async function signup(req, res) {
  const { user, session } = await authService.signup(req.body, clientInfo(req), {
    now: clock(req),
  });
  setAuthCookies(res, session);
  res.status(201).json({ user: toPublicUser(user) });
}

/** POST /auth/login -> 200 { user } + hf_session and csrf_token cookies */
export async function login(req, res) {
  const { user, session } = await authService.login(req.body, clientInfo(req), {
    now: clock(req),
  });
  setAuthCookies(res, session);
  res.json({ user: toPublicUser(user) });
}

/** POST /auth/logout -> 204, session row deleted and cookies cleared */
export async function logout(req, res) {
  await authService.logout(req.session.id);
  clearAuthCookies(res);
  res.status(204).end();
}

/** GET /auth/me -> { user, workspaces, activeWorkspaceId, plan } */
export async function me(req, res) {
  const me = await userService.getMe({ user: req.user, workspace: req.workspace });
  res.set('Cache-Control', 'no-store').json({
    user: toPublicUser(me.user),
    workspaces: me.memberships.map((m) => toPublicWorkspace(m.workspace, m.role)),
    activeWorkspaceId: me.activeWorkspaceId,
    plan: me.plan,
  });
}

/**
 * GET /auth/csrf -> { csrfToken } and a csrf_token cookie. Lets the SPA get a token before it
 * logs in, or after the cookie was lost. An existing token we issued is kept (only its lifetime
 * is extended) so other open tabs keep working; anything else is replaced.
 */
export function csrf(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = setCsrfCookie(res, {
    token: CSRF_TOKEN_FORMAT.test(existing ?? '') ? existing : undefined,
    maxAge: SESSION_TTL_MS,
  });
  res.set('Cache-Control', 'no-store').json({ csrfToken: token });
}
