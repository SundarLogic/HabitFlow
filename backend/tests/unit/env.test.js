/**
 * Unit tests for environment validation (parseEnv in src/config/env.js).
 *
 * "Unit" = testing one function in isolation with plain inputs. parseEnv takes a plain object
 * (like process.env) and returns Zod's result, so we can try many valid/invalid combinations
 * without touching files or real environment variables.
 */
import { parseEnv } from '../../src/config/env.js';

const base = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'habitflow',
  DB_PASSWORD: 'secret',
  DB_NAME: 'habitflow_dev',
  CLIENT_ORIGINS: 'http://localhost:5173',
};

// Top-level variable name of each issue (list items report e.g. CLIENT_ORIGINS.0).
const issuePaths = (result) => result.error.issues.map((issue) => issue.path[0]);

describe('parseEnv', () => {
  it('applies defaults and parses types', () => {
    const result = parseEnv(base);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_PORT: 5432,
      SESSION_TTL_DAYS: 30,
      COOKIE_SECURE: false,
      RUN_SCHEDULER: true,
      DB_SSL: false,
      SLOW_QUERY_MS: 500,
      LOG_LEVEL: 'info',
      CLIENT_ORIGINS: ['http://localhost:5173'],
    });
  });

  it('splits and trims a comma-separated CLIENT_ORIGINS list', () => {
    const result = parseEnv({
      ...base,
      CLIENT_ORIGINS: 'http://localhost:5173, https://app.habitflow.io',
    });

    expect(result.data.CLIENT_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://app.habitflow.io',
    ]);
  });

  it.each([
    ['CLIENT_ORIGINS', 'not-a-url'],
    ['CLIENT_ORIGINS', 'http://localhost:5173/'],
    ['PORT', 'abc'],
    ['SESSION_TTL_DAYS', '0'],
    ['COOKIE_SECURE', 'yes'],
    ['RUN_SCHEDULER', 'on'],
    ['DB_SSL', 'yes'],
    ['DB_POOL_MAX', '0'],
    ['SENTRY_DSN', 'not a url'],
    ['LOG_LEVEL', 'verbose'],
    ['NODE_ENV', 'staging'],
    ['DATABASE_URL', 'mysql://x@localhost/db'],
  ])('rejects invalid %s=%s', (key, value) => {
    const result = parseEnv({ ...base, [key]: value });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(key);
  });

  it('accepts DATABASE_URL instead of the DB_* parts', () => {
    const result = parseEnv({
      NODE_ENV: 'development',
      CLIENT_ORIGINS: 'http://localhost:5173',
      DATABASE_URL: 'postgres://u:p@localhost:5432/habitflow_dev',
    });

    expect(result.success).toBe(true);
  });

  it('requires every DB_* part when DATABASE_URL is missing (empty strings count as missing)', () => {
    const result = parseEnv({ ...base, DB_HOST: '', DB_PASSWORD: undefined });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(expect.arrayContaining(['DB_HOST', 'DB_PASSWORD']));
  });

  it('requires a *_test TEST_DATABASE_URL in test mode', () => {
    const missing = parseEnv({ ...base, NODE_ENV: 'test' });
    expect(issuePaths(missing)).toContain('TEST_DATABASE_URL');

    const devDb = parseEnv({
      ...base,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/habitflow_dev',
    });
    expect(devDb.success).toBe(false);

    const ok = parseEnv({
      ...base,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/habitflow_test',
    });
    expect(ok.success).toBe(true);
  });

  it('defaults COOKIE_SECURE to true in production and refuses false', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).data.COOKIE_SECURE).toBe(true);

    const insecure = parseEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' });
    expect(insecure.success).toBe(false);
    expect(issuePaths(insecure)).toContain('COOKIE_SECURE');
  });

  describe('production (Render + Neon, docs/DEPLOYMENT.md)', () => {
    const neon = {
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgres://u:p@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/habitflow',
      DB_SSL: 'true',
      CLIENT_ORIGINS: 'https://habitflow.vercel.app',
    };

    it('accepts a typical Render + Neon configuration', () => {
      const result = parseEnv(neon);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ COOKIE_SECURE: true, DB_SSL: true, RUN_SCHEDULER: true });
    });

    it('requires DB_SSL=true for a remote database', () => {
      const result = parseEnv({ ...neon, DB_SSL: undefined });
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('DB_SSL');
    });

    it('allows a local or Docker database without SSL', () => {
      for (const host of ['localhost', '127.0.0.1', 'db']) {
        const url = `postgres://u:p@${host}:5432/habitflow`;
        expect(parseEnv({ ...neon, DATABASE_URL: url, DB_SSL: undefined }).success).toBe(true);
      }
    });

    it('requires https:// browser origins (localhost is allowed for local testing)', () => {
      const http = parseEnv({ ...neon, CLIENT_ORIGINS: 'http://habitflow.vercel.app' });
      expect(http.success).toBe(false);
      expect(issuePaths(http)).toContain('CLIENT_ORIGINS');
      expect(parseEnv({ ...neon, CLIENT_ORIGINS: 'http://localhost:5173' }).success).toBe(true);
    });
  });
});
