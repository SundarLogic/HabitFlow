/**
 * Account API calls (docs/API.md §4): the logged-in user's own profile, password and account.
 */
import { api } from '../../services/apiClient.js';

/** PATCH /users/me with any of { name, timezone, notificationPreferences } -> the user. */
export async function updateMe(changes) {
  const { data } = await api.patch('/users/me', changes);
  return data.user;
}

/** PATCH /users/me/password. Other devices are logged out; this one stays logged in. */
export async function changePassword({ currentPassword, newPassword }) {
  await api.patch('/users/me/password', { currentPassword, newPassword });
}

/** DELETE /users/me with the password re-typed. Deletes the account and its personal data. */
export async function deleteAccount({ password }) {
  await api.delete('/users/me', { data: { password } });
}
