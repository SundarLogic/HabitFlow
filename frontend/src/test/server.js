/**
 * A fake HabitFlow API for tests (Mock Service Worker, intercepting axios at the network level).
 *
 * `backend` is a tiny in-memory stand-in for the server's session state, so a test can say
 * "logged in" or "logged out" and the auth endpoints behave accordingly:
 *
 *   backend.loggedIn = true;               // GET /auth/me now returns ME
 *   backend.notifications.push(makeNotification({ title: 'Gym' }));
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

/**
 * Session and account state. user: null = ME.user (PATCH /users/me stores the edited copy here);
 * notifications: the inbox, newest first.
 */
export const backend = { loggedIn: false, user: null, notifications: [] };

export function resetBackend() {
  backend.loggedIn = false;
  backend.user = null;
  backend.notifications = [];
}

const currentUser = () => backend.user ?? ME.user;
const unread = () => backend.notifications.filter((n) => !n.readAt);

let nextNotification = 1;
/** A notification as GET /notifications returns it (a reminder by default). */
export function makeNotification(overrides = {}) {
  return {
    id: `9c1e0000-0000-4000-8000-${String(nextNotification++).padStart(12, '0')}`,
    type: 'habit_reminder',
    title: 'Gym',
    message: `It's time for "Gym".`,
    data: { habitId: '00000000-0000-4000-8000-000000000001', reminderId: 'r1', date: '2026-10-26' },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const unauthenticated = () => apiError(401, 'UNAUTHENTICATED', 'Authentication required');

export const handlers = [
  http.get('/api/v1/auth/csrf', () => {
    document.cookie = 'csrf_token=test-csrf-token; path=/';
    return HttpResponse.json({ csrfToken: 'test-csrf-token' });
  }),
  http.get('/api/v1/auth/me', () =>
    backend.loggedIn ? HttpResponse.json({ ...ME, user: currentUser() }) : unauthenticated(),
  ),
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
    backend.loggedIn ? HttpResponse.json({ unreadCount: unread().length }) : unauthenticated(),
  ),
  http.get('/api/v1/notifications', () =>
    HttpResponse.json({
      data: backend.notifications,
      meta: {
        page: 1,
        limit: 20,
        total: backend.notifications.length,
        unreadCount: unread().length,
      },
    }),
  ),
  http.patch('/api/v1/notifications/:id/read', ({ params }) => {
    const notification = backend.notifications.find((n) => n.id === params.id);
    if (!notification) return apiError(404, 'NOT_FOUND', 'Notification not found');
    notification.readAt ??= new Date().toISOString();
    return HttpResponse.json({ notification });
  }),
  http.post('/api/v1/notifications/read-all', () => {
    const updated = unread();
    for (const n of updated) n.readAt = new Date().toISOString();
    return HttpResponse.json({ updated: updated.length });
  }),
  // Account (docs/API.md §4). The test password is 'correct-horse-42'.
  http.patch('/api/v1/users/me', async ({ request }) => {
    const { notificationPreferences, ...changes } = await request.json();
    const user = currentUser();
    backend.user = {
      ...user,
      ...changes,
      notificationPreferences: { ...user.notificationPreferences, ...notificationPreferences },
    };
    return HttpResponse.json({ user: backend.user });
  }),
  http.patch('/api/v1/users/me/password', async ({ request }) => {
    const { currentPassword } = await request.json();
    if (currentPassword !== 'correct-horse-42') {
      return apiError(422, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete('/api/v1/users/me', async ({ request }) => {
    const { password } = await request.json();
    if (password !== 'correct-horse-42') {
      return apiError(422, 'INVALID_CURRENT_PASSWORD', 'Password is incorrect');
    }
    backend.loggedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),
  // Habits, completions, /today and analytics: a small stateful fake (fakeHabits.js).
  ...habitHandlers,
];

export const server = setupServer(...handlers);
