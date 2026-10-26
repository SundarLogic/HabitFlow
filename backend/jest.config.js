/**
 * Jest configuration (the backend test runner). Run tests with `npm test`.
 *
 * Our code uses native ES modules (import/export). Jest supports them when Node is started with
 * --experimental-vm-modules, which the `npm test` script sets for you. That's also why you'll
 * see an "ExperimentalWarning: VM Modules" line in the output; it's expected and harmless.
 */
export default {
  // Run tests in a plain Node.js environment (not a simulated browser).
  testEnvironment: 'node',
  // No Babel/TypeScript compilation: run our JavaScript as-is.
  transform: {},
  // Test files are any *.test.js under tests/ (tests/unit for pure logic, tests/integration for HTTP + DB).
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Runs ONCE before all tests: applies migrations to the test database.
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  // Runs before EACH test file, before anything is imported: sets NODE_ENV=test, quiet logs.
  setupFiles: ['<rootDir>/tests/setup/setupEnv.js'],
  // Runs in EACH test file after Jest is ready: closes the DB connection when the file is done.
  setupFilesAfterEnv: ['<rootDir>/tests/setup/setupAfterEnv.js'],
  // Integration tests share one database and empty it between tests. Running test files in
  // parallel would let them delete each other's data, so we run them one at a time.
  maxWorkers: 1,
  // For `npm test -- --coverage`: measure everything in src/ except the startup script.
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  // Minimum coverage, enforced by `npm run test:coverage` (Phase 11): services and domain
  // rules at least 85%, and every line and branch of the streak and analytics engines.
  coverageThreshold: {
    './src/services/': { statements: 85, branches: 85, functions: 85, lines: 85 },
    './src/domain/': { statements: 85, branches: 85, functions: 85, lines: 85 },
    './src/domain/streaks.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/domain/analytics.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
