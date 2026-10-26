/**
 * Vite configuration: dev server, build, and the Vitest test runner.
 *
 * Dev proxy: the SPA calls relative URLs (/api/v1/...). In development Vite forwards /api to the
 * backend, so the browser sees ONE origin (http://localhost:5173). That keeps the session and
 * CSRF cookies first-party and avoids CORS entirely. Override the target with BACKEND_URL if the
 * API doesn't run on port 3000 (e.g. `BACKEND_URL=http://localhost:4000 npm run dev`).
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';

/**
 * The security headers Vercel sends with the app (vercel.json), reused by `npm run preview` so
 * the production Content-Security-Policy can be tried locally before deploying. HSTS and
 * upgrade-insecure-requests are left out: preview runs on plain http://localhost.
 */
function vercelSecurityHeaders() {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
  const rule = config.headers.find((h) =>
    h.headers.some((x) => x.key === 'Content-Security-Policy'),
  );
  return Object.fromEntries(
    rule.headers
      .filter(({ key }) => key !== 'Strict-Transport-Security')
      .map(({ key, value }) => [
        key,
        key === 'Content-Security-Policy'
          ? value.replace(/;\s*upgrade-insecure-requests/, '')
          : value,
      ]),
  );
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true, // the backend's CLIENT_ORIGINS expects exactly this port
    proxy: {
      '/api': { target: backendUrl, changeOrigin: false },
    },
  },
  // `npm run preview` serves the production build (dist/) the same way, e.g. for Lighthouse.
  preview: {
    port: 4173,
    headers: vercelSecurityHeaders(),
    proxy: {
      '/api': { target: backendUrl, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    // Unit/integration tests only; Playwright's e2e/*.spec.js files run with `npm run test:e2e`.
    include: ['src/**/*.test.{js,jsx}'],
    // describe/it/expect without imports, and automatic DOM cleanup after each test.
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // jsdom needs a real-looking URL so relative API paths resolve and cookies can be set.
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
  },
});
