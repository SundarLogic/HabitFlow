/**
 * Auth API calls (docs/API.md §3). Thin wrappers over the shared apiClient that return the
 * useful part of each response. Errors arrive as ApiError (see services/apiClient.js).
 */
import { api } from '../../services/apiClient.js';

/**
 * GET /auth/me. Returns null when nobody is logged in (401), instead of throwing, because
 * "anonymous" is a normal state for the app, not an error.
 * @returns {Promise<{ user: object, workspaces: object[], activeWorkspaceId: string,
 *   plan: object } | null>}
 */
export async function fetchMe() {
  try {
    const { data } = await api.get('/auth/me');
    return data;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

/** POST /auth/login -> the user (the session cookie is set by the response). */
export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  return data.user;
}

/** POST /auth/signup -> the new user, already logged in. */
export async function signup({ name, email, password, timezone }) {
  const { data } = await api.post('/auth/signup', { name, email, password, timezone });
  return data.user;
}

/** POST /auth/logout: ends this device's session. */
export async function logout() {
  await api.post('/auth/logout');
}
