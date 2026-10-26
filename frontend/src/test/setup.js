/**
 * Runs before every test file (vite.config.js -> test.setupFiles).
 *
 *   - adds jest-dom matchers (toBeInTheDocument, toHaveAttribute, ...);
 *   - starts the MSW fake API; any request WITHOUT a handler fails the test, so tests can't
 *     silently depend on a real server;
 *   - stubs ResizeObserver (jsdom lacks it; Recharts' ResponsiveContainer needs it);
 *   - resets handlers, the fake session and cookies between tests so tests stay independent.
 */
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { resetDb } from './fakeHabits.js';
import { resetBackend, server } from './server.js';

// jsdom has no layout, so the stub never reports a size: charts render empty, their data tables don't.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// findBy*/waitFor wait up to 3 s instead of 1 s. The first test of a file renders the whole app
// while Vite transforms it; on a fresh install (always the case in CI) that can exceed 1 s.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  server.resetHandlers();
  resetBackend();
  resetDb();
  // Expire every cookie set during the test.
  for (const cookie of document.cookie.split('; ').filter(Boolean)) {
    const name = cookie.split('=')[0];
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
});

afterAll(() => server.close());
