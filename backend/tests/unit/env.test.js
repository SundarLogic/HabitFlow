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
});
