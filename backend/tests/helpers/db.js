/**
 * Database helpers for tests.
 *
 * Tests must not depend on each other. If test A creates a user and test B assumes the table
 * is empty, B passes or fails depending on run order. So any test that writes to the database
 * should start from empty tables:
 *
 *   import { truncateAllTables } from '../helpers/db.js';
 *   beforeEach(async () => {
 *     await truncateAllTables();
 *   });
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/models/index.js';

// Never empty the table that records which migrations ran; otherwise the next test run would
// try to re-apply every migration on top of existing tables.
const ALWAYS_KEEP = ['SequelizeMeta'];

// Wraps a table name in double quotes for SQL (and escapes any quotes inside the name), so
// names with capital letters like "SequelizeMeta" are handled correctly.
const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

/**
 * Deletes all rows from every table in the database (except migration metadata) and resets
 * auto-increment counters back to 1.
 *
 * @param {{ except?: string[] }} [options] tables to leave untouched, e.g. reference data
 *   such as `plans` that a seeder inserted: truncateAllTables({ except: ['plans'] })
 */
export async function truncateAllTables({ except = [] } = {}) {
  // Safety check: refuse to run against anything that isn't a *_test database.
  const [{ name }] = await sequelize.query('SELECT current_database() AS name', {
    type: QueryTypes.SELECT,
  });
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to truncate tables in non-test database "${name}"`);
  }

  // Ask PostgreSQL for every table in the default "public" schema.
  const rows = await sequelize.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    { type: QueryTypes.SELECT },
  );
  const keep = new Set([...ALWAYS_KEEP, ...except]);
  const tables = rows.map((row) => row.tablename).filter((table) => !keep.has(table));
  if (tables.length === 0) return;

  // One TRUNCATE for all tables at once (much faster than DELETE).
  // RESTART IDENTITY resets auto-increment ids; CASCADE also empties tables that reference them.
  await sequelize.query(
    `TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

// Re-exported so tests can run raw queries with the same connection.
export { sequelize };
