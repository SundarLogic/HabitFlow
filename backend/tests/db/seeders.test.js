/**
 * Seeder tests. Seeders are not recorded by sequelize-cli and may run many times, so they must
 * be idempotent; the demo seeder must also never write outside development.
 *
 * Seeders are CommonJS (.cjs) files, so we load them with createRequire and call their `up`
 * function with the same queryInterface sequelize-cli would pass.
 */
import { createRequire } from 'node:module';
import { Plan, sequelize, User } from '../../src/models/index.js';
import { truncateAllTables } from '../helpers/db.js';

const require = createRequire(import.meta.url);
const plansSeeder = require('../../src/seeders/20261025000101-plans.cjs');
const demoSeeder = require('../../src/seeders/20261025000102-demo-data.cjs');

const queryInterface = sequelize.getQueryInterface();

beforeEach(async () => {
  await truncateAllTables();
});

describe('plans seeder', () => {
  it('creates free and pro plans with their limits', async () => {
    await plansSeeder.up(queryInterface);

    const free = await Plan.findOne({ where: { code: 'free' } });
    const pro = await Plan.findOne({ where: { code: 'pro' } });
    expect(free.limits).toEqual({ maxActiveHabits: 10, historyDays: null });
    expect(pro.limits.maxActiveHabits).toBeNull();
    expect(pro.isActive).toBe(true);
    expect(pro.features.purchasable).toBe(false);
  });

  it('is idempotent and keeps plan ids stable', async () => {
    await plansSeeder.up(queryInterface);
    const before = await Plan.findOne({ where: { code: 'free' } });

    await plansSeeder.up(queryInterface);
    expect(await Plan.count()).toBe(2);
    const after = await Plan.findOne({ where: { code: 'free' } });
    expect(after.id).toBe(before.id);
  });
});

describe('demo-data seeder', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('writes nothing when NODE_ENV=test', async () => {
    await demoSeeder.up(queryInterface);
    expect(await User.count()).toBe(0);
  });

  it('refuses to run when NODE_ENV=production', async () => {
    // Only the seeder reads this variable; the app config was already loaded as "test".
    process.env.NODE_ENV = 'production';
    await expect(demoSeeder.up(queryInterface)).rejects.toThrow(/never run in production/);
    expect(await User.count()).toBe(0);
  });
});
