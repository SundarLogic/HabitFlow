/**
 * env.js — loads and VALIDATES all environment variables once, at startup.
 *
 * Environment variables are settings that change per machine/deployment (ports, database
 * passwords, allowed origins...). Locally they come from backend/.env; in production from the
 * hosting platform.
 *
 * Why validate? process.env values are always strings (or missing). If PORT were "abc" or the
 * DB password missing, the app would fail later with a confusing error. Instead we check
 * everything here with Zod and stop immediately with a clear list of what to fix.
 *
 * Usage everywhere else in the app:
 *   import { env } from './config/env.js';
 *   env.PORT            // a number, not a string
 *   env.CLIENT_ORIGINS  // an array of strings
 * Do not read process.env directly in app code; use `env`, which is typed and validated.
 */
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Absolute path of backend/.env, computed relative to THIS file, so it works no matter which
// folder you run `node` from. (import.meta.url is the URL of the current module file.)
export const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

// ---------------------------------------------------------------------------------------------
// Reusable Zod building blocks
// ---------------------------------------------------------------------------------------------

// z.coerce.number() converts the string "3000" into the number 3000 before checking it.
const port = z.coerce.number().int().min(1).max(65535);

// A PostgreSQL connection string like postgres://user:pass@host:5432/dbname.
// .refine(check, message) adds a custom rule: `check` returns true when the value is valid.
const postgresUrl = z.string().refine((value) => {
  try {
    return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
  } catch {
    return false; // new URL() throws if the string isn't a URL at all
  }
}, 'must be a postgres:// or postgresql:// URL');

// Turns the strings "true"/"false" into real booleans. (We avoid z.coerce.boolean() because
// it treats ANY non-empty string, including "false", as true.)
const booleanString = z
  .enum(['true', 'false'], { message: 'must be "true" or "false"' })
  .transform((value) => value === 'true');

// A browser origin: scheme + host (+ optional port), e.g. http://localhost:5173.
// new URL(value).origin strips any path, so if it equals the input there was no path/slash.
const origin = z.string().refine((value) => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}, 'each origin must look like http://host[:port] with no path or trailing slash');

// "http://a.com, http://b.com" -> ['http://a.com', 'http://b.com'], then each one is checked.
// .transform() changes the value; .pipe() then validates the transformed value with another schema.
const clientOrigins = z
  .string()
  .transform(
    (value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean), // drop empty entries, e.g. from a trailing comma
  )
  .pipe(z.array(origin).min(1, 'at least one origin is required'));

// The individual connection settings that are required when DATABASE_URL is not used.
const DB_PARTS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

/** Extracts the database name from a connection URL ("postgres://.../habitflow_test" -> "habitflow_test"). */
function databaseName(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

// ---------------------------------------------------------------------------------------------
// The full schema. Each key is one environment variable.
// .default(x) = value used when the variable is missing. .optional() = may be missing.
// ---------------------------------------------------------------------------------------------
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: port.default(3000),
    DATABASE_URL: postgresUrl.optional(),
    DB_HOST: z.string().optional(),
    DB_PORT: port.optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_NAME: z.string().optional(),
    TEST_DATABASE_URL: postgresUrl.optional(),
    CLIENT_ORIGINS: clientOrigins,
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_SECURE: booleanString.optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  })
  // superRefine = rules that involve SEVERAL variables at once. ctx.addIssue() reports a problem.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'test') {
      // Tests need their own database.
      if (!env.TEST_DATABASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['TEST_DATABASE_URL'],
          message: 'is required when NODE_ENV=test',
        });
      } else if (!databaseName(env.TEST_DATABASE_URL).endsWith('_test')) {
        // Safety guard: tests delete all rows between runs. Never let them touch a real database.
        ctx.addIssue({
          code: 'custom',
          path: ['TEST_DATABASE_URL'],
          message: 'database name must end with "_test"',
        });
      }
    } else if (!env.DATABASE_URL) {
      // Outside tests we need EITHER DATABASE_URL OR all five DB_* parts.
      for (const key of DB_PARTS) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required when DATABASE_URL is not set',
          });
        }
      }
    }

    // Secure cookies are only sent over HTTPS. In production they must be on.
    if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
  })
  // Final touch: if COOKIE_SECURE wasn't set, default it to true in production, false otherwise.
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

/**
 * Validates a raw environment object (like process.env) and returns Zod's result:
 *   { success: true, data }  or  { success: false, error }.
 *
 * Empty strings are treated as "not set" (a line like `DB_HOST=` in .env gives '').
 * This function has no side effects (no file reading, no exiting), which makes it easy to
 * unit-test with different inputs. See tests/unit/env.test.js.
 */
export function parseEnv(raw) {
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''),
  );
  return envSchema.safeParse(cleaned);
}

/** Reads backend/.env into process.env, validates it, and exits the process if invalid. */
function loadEnv() {
  // dotenv copies KEY=value lines from the .env file into process.env.
  // It never overwrites variables that are already set (e.g. by the shell or by npm test).
  // quiet: true stops dotenv from printing its own log message.
  dotenv.config({ path: ENV_FILE, quiet: true });

  const result = parseEnv(process.env);
  if (!result.success) {
    // We can't use the logger here (the logger itself needs LOG_LEVEL from this config),
    // so write straight to stderr. z.prettifyError lists each problem and which variable
    // it belongs to, without printing secret values.
    process.stderr.write(
      `\nInvalid environment configuration (checked process env and ${ENV_FILE}):\n` +
        `${z.prettifyError(result.error)}\n` +
        'See backend/.env.example for every variable and its format.\n\n',
    );
    process.exit(1);
  }
  // Object.freeze prevents any code from accidentally changing the config at runtime.
  return Object.freeze(result.data);
}

// Runs once, the first time any file imports env.js.
export const env = loadEnv();
