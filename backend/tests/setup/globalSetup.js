/**
 * Runs ONCE before the whole test suite (configured as `globalSetup` in jest.config.js).
 *
 * It applies all database migrations to the TEST database (habitflow_test) so that every test
 * starts with the latest table structure. It runs the real sequelize-cli in a child process,
 * exactly like `npm run db:migrate` but with NODE_ENV=test, so tests use the same migrations
 * as production.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// createRequire gives us `require.resolve` inside an ES module, to locate installed packages.
const require = createRequire(import.meta.url);
// The backend/ folder (two levels up from tests/setup/).
const backendRoot = fileURLToPath(new URL('../..', import.meta.url));

export default function globalSetup() {
  // Path to sequelize-cli's executable script inside node_modules.
  const cli = path.join(
    path.dirname(require.resolve('sequelize-cli/package.json')),
    'lib',
    'sequelize',
  );
  try {
    // Equivalent to: NODE_ENV=test sequelize-cli --options-path .sequelizerc.cjs db:migrate
    // process.execPath is the current `node` binary, which works the same on Windows and Unix.
    execFileSync(process.execPath, [cli, '--options-path', '.sequelizerc.cjs', 'db:migrate'], {
      cwd: backendRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe', // capture output; we only show it if something goes wrong
    });
  } catch (err) {
    // The most common cause is that Docker/PostgreSQL isn't running, so say that clearly.
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    throw new Error(
      'Could not migrate the test database. Is PostgreSQL running (docker compose up -d) ' +
        `and TEST_DATABASE_URL set in backend/.env?\n${output}`,
      { cause: err },
    );
  }
}
