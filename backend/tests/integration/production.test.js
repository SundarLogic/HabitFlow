/**
 * Production-mode behaviour (NODE_ENV=production), checked in a child process because env.js is
 * evaluated once per process (see tests/fixtures/productionProbe.js):
 *   - session and CSRF cookies are Secure + SameSite=Lax; the session cookie is HttpOnly and the
 *     CSRF cookie is readable by the SPA;
 *   - helmet headers, including HSTS, and no X-Powered-By;
 *   - CORS answers only configured origins;
 *   - bodies over 100 kb are refused;
 *   - 500 responses carry no stack trace, no internal message and no SQL.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../../src/config/env.js';
import { seedPlans } from '../helpers/auth.js';

const run = promisify(execFile);
let probe;

beforeAll(async () => {
  await seedPlans();
  const { stdout } = await run(
    process.execPath,
    [path.resolve('tests/fixtures/productionProbe.js')],
    {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NODE_OPTIONS: '', // the probe is plain ESM; Jest's VM flag isn't needed
        DATABASE_URL: env.TEST_DATABASE_URL,
        CLIENT_ORIGINS: 'https://app.example.com',
        COOKIE_SECURE: 'true',
        LOG_LEVEL: 'silent',
      },
      timeout: 60_000,
    },
  );
  probe = JSON.parse(stdout);
}, 90_000);

it('sets hardened cookies', () => {
  expect(probe.signupStatus).toBe(201);
  const session = probe.setCookie.find((c) => c.startsWith('hf_session='));
  const csrf = probe.setCookie.find((c) => c.startsWith('csrf_token='));
  expect(session).toMatch(/; HttpOnly/);
  for (const cookie of [session, csrf]) {
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
  }
  expect(csrf).not.toMatch(/HttpOnly/); // the SPA must read it
});

it('sends security headers and hides the framework', () => {
  expect(probe.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  expect(probe.headers['x-content-type-options']).toBe('nosniff');
  expect(probe.headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(probe.headers['content-security-policy']).toContain("default-src 'self'");
  expect(probe.headers['x-powered-by']).toBeUndefined();
});

it('allows CORS only for configured origins', () => {
  expect(probe.corsAllowed).toBe('https://app.example.com');
  expect(probe.corsDenied).toBeNull();
});

it('refuses bodies over 100 kb', () => {
  expect(probe.tooLarge.error.code).toBe('PAYLOAD_TOO_LARGE');
});

it('never leaks stack traces, internal messages or SQL in 500 responses', () => {
  for (const body of [probe.boom, probe.sql]) {
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
  const text = JSON.stringify(probe);
  expect(text).not.toMatch(/secret-path|no_such_table|secret_column|at .*\.js:\d+/);
});
