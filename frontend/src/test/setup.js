/**
 * Runs before every test file (vite.config.js -> test.setupFiles).
 *
 *   - adds jest-dom matchers (toBeInTheDocument, toHaveAttribute, ...);
 *   - starts the MSW fake API; any request WITHOUT a handler fails the test, so tests can't
 *     silently depend on a real server;
 *   - resets handlers, the fake session and cookies between tests so tests stay independent.
 */
import '@testing-library/jest-dom/vitest';
import { resetDb } from './fakeHabits.js';
import { backend, server } from './server.js';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  backend.loggedIn = false;
  resetDb();
  // Expire every cookie set during the test.
  for (const cookie of document.cookie.split('; ').filter(Boolean)) {
    const name = cookie.split('=')[0];
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
});

afterAll(() => server.close());
