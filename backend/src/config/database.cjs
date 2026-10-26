/**
 * database.cjs — database connection settings for every environment.
 *
 * This ONE file is used by two different consumers, so their settings can never drift apart:
 *   1. sequelize-cli (the migration tool, `npm run db:migrate`), which can only load CommonJS
 *      files. That's why this file uses `require` / `module.exports` and ends in `.cjs`.
 *   2. The app itself (src/models/index.js imports it).
 *
 * The exported object has one entry per NODE_ENV: development, test, production.
 * Variables are validated by src/config/env.js when the app starts; the CLI only uses them.
 *
 * Production (Render + Neon, docs/DEPLOYMENT.md):
 *   DATABASE_URL         Neon's POOLED connection string, used by the app
 *   DATABASE_DIRECT_URL  optional, Neon's DIRECT connection string, used by sequelize-cli only
 *   DB_SSL=true          TLS on, with the server certificate verified
 *   DB_POOL_MAX          connections per process (default 5 in production, 10 otherwise)
 */
const path = require('node:path');
const dotenv = require('dotenv');

// sequelize-cli doesn't run env.js, so load backend/.env here too.
// (__dirname = the folder containing this file, i.e. backend/src/config.)
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Settings shared by all environments.
const common = {
  dialect: 'postgres',
  logging: false, // don't print every SQL query to the console
  timezone: '+00:00', // store and read timestamps in UTC (see CLAUDE.md §3)
  define: {
    underscored: true, // model field `createdAt` <-> database column `created_at`
    timestamps: true, // models get created_at / updated_at automatically
  },
  // Connection pool: open connections reused across requests (opening a new connection per
  // request would be slow). Times are in milliseconds. Production defaults to 5: hosted
  // databases (Neon's free tier) cap connections, and one Node process rarely needs more.
  pool: {
    max: Number(process.env.DB_POOL_MAX) || (process.env.NODE_ENV === 'production' ? 5 : 10),
    min: 0,
    idle: 10000,
    acquire: 30000,
  },
  // TLS when DB_SSL=true. rejectUnauthorized: true verifies the server certificate against the
  // system's trusted CAs (Neon's certificates are publicly trusted), so a man in the middle
  // can't pose as the database.
  ...(process.env.DB_SSL === 'true'
    ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: true } } }
    : {}),
  // Table where sequelize-cli records which migrations have already run.
  migrationStorageTableName: 'SequelizeMeta',
  // Seeders are not recorded (sequelize-cli default storage "none"), so every seeder must be
  // idempotent (upsert / ON CONFLICT) and db:seed can be re-run safely.
};

/**
 * Builds a config from either a full connection URL (DATABASE_URL) or the separate DB_* parts.
 * A URL is common on hosting platforms; the parts are easier to edit locally.
 */
function fromUrlOrParts(url) {
  if (url) return { ...common, url };
  return {
    ...common,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

/** Test config, with a safety check: tests and `db:reset` delete data. */
function testConfig(url) {
  // Refuse anything that is not a *_test database, so a typo can never wipe dev data.
  if (process.env.NODE_ENV === 'test') {
    const name = url ? decodeURIComponent(new URL(url).pathname.slice(1)) : '';
    if (!name.endsWith('_test')) {
      throw new Error(
        'TEST_DATABASE_URL must be set and point to a database whose name ends with "_test"',
      );
    }
  }
  return { ...common, url };
}

// The CLI may use a separate (direct) connection for migrations; see .sequelizerc.cjs.
const isCli = process.env.HABITFLOW_DB_CLIENT === 'cli';
const appOrCliUrl = (isCli && process.env.DATABASE_DIRECT_URL) || process.env.DATABASE_URL;

module.exports = {
  development: fromUrlOrParts(appOrCliUrl),
  test: testConfig(process.env.TEST_DATABASE_URL),
  production: fromUrlOrParts(appOrCliUrl),
};
