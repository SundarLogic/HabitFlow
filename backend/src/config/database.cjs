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
  // Connection pool: up to 10 open connections reused across requests (opening a new
  // connection per request would be slow). Times are in milliseconds.
  pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
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

module.exports = {
  development: fromUrlOrParts(process.env.DATABASE_URL),
  test: testConfig(process.env.TEST_DATABASE_URL),
  production: fromUrlOrParts(process.env.DATABASE_URL),
};
