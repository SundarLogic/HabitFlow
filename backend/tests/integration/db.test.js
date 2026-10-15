/**
 * Tests for the test-database harness itself, and for how REAL PostgreSQL errors are mapped.
 *
 * We create two temporary tables (harness_parents / harness_children) to trigger genuine
 * unique-constraint and foreign-key errors from PostgreSQL, then check that toAppError() turns
 * them into the right HTTP status and code. The tables are dropped again in afterAll.
 */
import { QueryTypes } from 'sequelize';
import { toAppError } from '../../src/middleware/errorHandler.js';
import { sequelize, truncateAllTables } from '../helpers/db.js';

const count = async (table) => {
  const [{ n }] = await sequelize.query(`SELECT count(*)::int AS n FROM ${table}`, {
    type: QueryTypes.SELECT,
  });
  return n;
};

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the query to fail');
}

describe('test database harness', () => {
  beforeAll(async () => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS harness_parents (id serial PRIMARY KEY, email text UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS harness_children (
        id serial PRIMARY KEY,
        parent_id int NOT NULL REFERENCES harness_parents(id) ON DELETE RESTRICT
      );
    `);
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS harness_children, harness_parents');
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  it('is connected to the *_test database with migrations applied', async () => {
    const [{ name }] = await sequelize.query('SELECT current_database() AS name', {
      type: QueryTypes.SELECT,
    });
    expect(name).toMatch(/_test$/);
    expect(await count('"SequelizeMeta"')).toBeGreaterThanOrEqual(0);
  });

  it('truncateAllTables empties tables, keeps SequelizeMeta, and resets sequences', async () => {
    await sequelize.query("INSERT INTO harness_parents (email) VALUES ('a@b.com'), ('c@d.com')");
    expect(await count('harness_parents')).toBe(2);

    await truncateAllTables();
    expect(await count('harness_parents')).toBe(0);

    await sequelize.query("INSERT INTO harness_parents (email) VALUES ('e@f.com')");
    const [{ id }] = await sequelize.query('SELECT id FROM harness_parents', {
      type: QueryTypes.SELECT,
    });
    expect(id).toBe(1);
  });

  it('maps a real unique violation to 409 UNIQUE_VIOLATION', async () => {
    await sequelize.query("INSERT INTO harness_parents (email) VALUES ('dup@b.com')");
    const err = await rejectionOf(
      sequelize.query("INSERT INTO harness_parents (email) VALUES ('dup@b.com')"),
    );

    expect(toAppError(err)).toMatchObject({ status: 409, code: 'UNIQUE_VIOLATION' });
  });

  it('maps real foreign key violations to 422 (bad reference) and 409 (still referenced)', async () => {
    const insertErr = await rejectionOf(
      sequelize.query('INSERT INTO harness_children (parent_id) VALUES (999)'),
    );
    expect(toAppError(insertErr)).toMatchObject({ status: 422, code: 'INVALID_REFERENCE' });

    await sequelize.query("INSERT INTO harness_parents (email) VALUES ('p@b.com')");
    await sequelize.query('INSERT INTO harness_children (parent_id) VALUES (1)');
    const deleteErr = await rejectionOf(
      sequelize.query('DELETE FROM harness_parents WHERE id = 1'),
    );
    expect(toAppError(deleteErr)).toMatchObject({ status: 409, code: 'RESOURCE_IN_USE' });
  });
});
