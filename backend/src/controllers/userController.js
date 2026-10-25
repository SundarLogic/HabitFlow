/**
 * User controller: the HTTP layer for /api/v1/users/me (the logged-in user's own account).
 * requireAuth has set req.user and req.session; the body was validated by userValidators.js.
 */
import { toPublicUser } from '../serializers/user.js';
import * as userService from '../services/userService.js';
import { clearAuthCookies } from '../utils/cookies.js';

/** PATCH /users/me -> 200 { user } */
export async function updateMe(req, res) {
  const user = await userService.updateProfile(req.user, req.body);
  res.json({ user: toPublicUser(user) });
}

/** PATCH /users/me/password -> 204. Other sessions are revoked; this one stays logged in. */
export async function changePassword(req, res) {
  await userService.changePassword({
    userId: req.user.id,
    sessionId: req.session.id,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  res.status(204).end();
}

/** DELETE /users/me -> 204, account and personal data deleted, cookies cleared */
export async function deleteMe(req, res) {
  await userService.deleteAccount({ userId: req.user.id, password: req.body.password });
  clearAuthCookies(res);
  res.status(204).end();
}
