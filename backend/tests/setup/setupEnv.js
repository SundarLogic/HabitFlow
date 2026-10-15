/**
 * Runs at the start of EVERY test file, before any of our modules are imported
 * (configured as `setupFiles` in jest.config.js).
 *
 * Setting variables here matters because src/config/env.js reads them on first import, and
 * dotenv never overwrites variables that are already set. So these values win over backend/.env.
 */

// Always use the test configuration (the test database, etc.).
process.env.NODE_ENV = 'test';

// Keep test output clean. To see logs while debugging a test, set LOG_LEVEL in your shell, e.g.
//   LOG_LEVEL=debug npm test   (macOS/Linux/Git Bash)
// `||=` only assigns when the variable is empty, so a value you set yourself is kept.
process.env.LOG_LEVEL ||= 'silent';
