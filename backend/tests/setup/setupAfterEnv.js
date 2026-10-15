/**
 * Runs in EVERY test file once Jest's test functions are available
 * (configured as `setupFilesAfterEnv` in jest.config.js).
 *
 * Jest gives each test file its own copy of our modules, so each file opens its own database
 * connection pool. Open connections keep Node running, and Jest would hang at the end
 * ("Jest did not exit..."). Closing the pool after each file prevents that.
 */
import { sequelize } from '../../src/models/index.js';

afterAll(async () => {
  await sequelize.close();
});
