/**
 * A fake HabitFlow API for tests (Mock Service Worker, intercepting axios at the network level).
 *
 * `backend` is a tiny in-memory stand-in for the server's session state, so a test can say
 * "logged in" or "logged out" and the auth endpoints behave accordingly:
 *
 *   backend.loggedIn = true;               // GET /auth/me now returns ME
 *   server.use(http.post(...))             // override one endpoint for a single test
 *
 * Responses use the real API shapes from docs/API.md. Cookies: jsdom doesn't apply Set-Cookie
 * from mocked responses, so handlers write document.cookie directly, like the browser would.
 */
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { habitHandlers } from './fakeHabits.js';

export const ME = {
  user: {
    id: '3a2fad36-0000-4000-8000-000000000001',
    name: 'Ana Lima',
    email: 'ana@example.com',
    timezone: 'America/New_York',
    notificationPreferences: { inApp: true, reminders: true },
    lastLoginAt: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  },
  workspaces: [
    {
      id: 'cc15dd7f-0000-4000-8000-000000000002',
      name: "Ana Lima's Habits",
      type: 'personal',
      role: 'owner',
    },
  ],
  activeWorkspaceId: 'cc15dd7f-0000-4000-8000-000000000002',
  plan: { code: 'free', limits: { maxActiveHabits: 10, historyDays: null } },
};

/** Builds the API's error body. */
export function apiError(status, code, message, details) {
  return HttpResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export const backend = { loggedIn: false };

const unauthenticated = () => apiError(401, 'UNAUTHENTICATED', 'Authentication required');

export const handlers = [
  http.get('/api/v1/auth/csrf', () => {
    document.cookie = 'csrf_token=test-csrf-token; path=/';
    return HttpResponse.json({ csrfToken: 'test-csrf-token' });
  }),
  http.get('/api/v1/auth/me', () => (backend.loggedIn ? HttpResponse.json(ME) : unauthenticated())),
  http.post('/api/v1/auth/login', async ({ request }) => {
    const { email, password } = await request.json();
    if (email !== ME.user.email || password !== 'correct-horse-42') {
      return apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    backend.loggedIn = true;
    return HttpResponse.json({ user: ME.user });
  }),
  http.post('/api/v1/auth/signup', async ({ request }) => {
    const body = await request.json();
    backend.loggedIn = true;
    return HttpResponse.json(
      { user: { ...ME.user, name: body.name, email: body.email } },
      { status: 201 },
    );
  }),
  http.post('/api/v1/auth/logout', () => {
    backend.loggedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/v1/notifications/unread-count', () =>
    backend.loggedIn ? HttpResponse.json({ unreadCount: 0 }) : unauthenticated(),
  ),
  // Habits, completions, /today and analytics: a small stateful fake (fakeHabits.js).
  ...habitHandlers,
];

export const server = setupServer(...handlers);
