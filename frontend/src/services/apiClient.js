/**
 * The ONE HTTP client for the HabitFlow API (docs/API.md). Every feature's API functions use it.
 *
 * What it adds to every request:
 *   - baseURL /api/v1 and cookies (withCredentials). In development the Vite proxy makes the API
 *     same-origin, so the HttpOnly session cookie just works.
 *   - X-CSRF-Token on every non-GET request: the value of the csrf_token cookie (double-submit
 *     CSRF protection, CLAUDE.md §3.1). If the cookie is missing it is fetched first.
 *   - X-Workspace-Id when a workspace other than the default one is selected.
 *
 * What it does with every failure: turns it into an ApiError { status, code, message, details },
 * the shape of the backend's error body, so components never dig into axios internals.
 * On 401 UNAUTHENTICATED it calls the handler registered by AuthProvider (clear the auth cache,
 * redirect to /login with a returnTo).
 */
import axios from 'axios';
import { readCookie } from '../lib/cookies.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'X-CSRF-Token';
export const WORKSPACE_HEADER = 'X-Workspace-Id';

const SAFE_METHODS = new Set(['get', 'head', 'options']);

/** A failed API call, normalised. `status` 0 means the server was unreachable. */
export class ApiError extends Error {
  /**
   * @param {{ status: number, code: string, message: string, details?: unknown }} fields
   */
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const api = axios.create({ baseURL: '/api/v1', withCredentials: true });

// ---------------------------------------------------------------------------------------------
// Module state: set by the app at runtime (AuthProvider), read by the interceptors.
// ---------------------------------------------------------------------------------------------
let activeWorkspaceId = null;
let onUnauthorized = () => {};
let csrfRequest = null;

/** Selects the workspace sent as X-Workspace-Id (null = the user's personal workspace). */
export function setActiveWorkspaceId(id) {
  activeWorkspaceId = id ?? null;
}

/** Registers what to do when the session is gone (AuthProvider: clear cache + go to /login). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler ?? (() => {});
}

/**
 * Makes sure a csrf_token cookie exists (GET /auth/csrf). Called at start-up and, lazily, before
 * a write if the cookie disappeared. Concurrent callers share one request.
 * @returns {Promise<void>}
 */
export async function ensureCsrfToken() {
  if (readCookie(CSRF_COOKIE)) return;
  csrfRequest ??= api.get('/auth/csrf').finally(() => {
    csrfRequest = null;
  });
  await csrfRequest;
}

/** Converts any axios error into an ApiError with the backend's { code, message, details }. */
export function toApiError(error) {
  if (error instanceof ApiError) return error;
  const response = error.response;
  if (!response) {
    return new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach HabitFlow. Check your connection and try again.',
    });
  }
  const body = response.data?.error;
  return new ApiError({
    status: response.status,
    code: body?.code ?? 'UNKNOWN_ERROR',
    message: body?.message ?? 'Something went wrong. Please try again.',
    details: body?.details,
  });
}

api.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (!SAFE_METHODS.has(method) && !config.url?.startsWith('/auth/csrf')) {
    await ensureCsrfToken();
    const token = readCookie(CSRF_COOKIE);
    if (token) config.headers.set(CSRF_HEADER, token);
  }
  if (activeWorkspaceId) config.headers.set(WORKSPACE_HEADER, activeWorkspaceId);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    // Only a lost/expired session redirects. INVALID_CREDENTIALS (wrong password at login) is
    // also a 401 but must stay on the form.
    if (apiError.status === 401 && apiError.code === 'UNAUTHENTICATED') onUnauthorized(apiError);
    return Promise.reject(apiError);
  },
);
