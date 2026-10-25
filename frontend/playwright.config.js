/**
 * Playwright end-to-end tests: the real app in a real browser, against the real API.
 * Run with `npm run test:e2e` (Docker/Postgres must be running).
 *
 * Isolation: Playwright starts its OWN servers on spare ports, so a `npm run dev` you have open is
 * not disturbed:
 *   API  http://localhost:3100  backend with NODE_ENV=test -> the habitflow_test database
 *   Web  http://localhost:5174  Vite dev server proxying /api to the API above
 * e2e/global-setup.js migrates the test database and seeds the plans first.
 *
 * Two projects run every test: a desktop browser and a 375 px-wide phone.
 */
import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one shared test database
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { NODE_ENV: 'test', PORT: String(API_PORT), LOG_LEVEL: 'warn' },
      reuseExistingServer: false, // fresh rate-limit counters every run
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { BACKEND_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
