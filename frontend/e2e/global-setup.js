/**
 * Runs once before the E2E suite: migrates the TEST database and seeds the plan catalogue
 * (signup needs the `free` plan). Uses the backend's own sequelize-cli setup, with
 * NODE_ENV=test, whose config refuses any database not ending in "_test".
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = fileURLToPath(new URL('../../backend', import.meta.url));
const require = createRequire(path.join(backendRoot, 'package.json'));

export default function globalSetup() {
  const cli = path.join(
    path.dirname(require.resolve('sequelize-cli/package.json')),
    'lib',
    'sequelize',
  );
  const run = (...args) => {
    try {
      execFileSync(process.execPath, [cli, '--options-path', '.sequelizerc.cjs', ...args], {
        cwd: backendRoot,
        env: { ...process.env, NODE_ENV: 'test' },
        stdio: 'pipe',
      });
    } catch (err) {
      // Show the CLI's own output: usually "is Postgres running?" or a bad backend/.env.
      throw new Error(
        `sequelize-cli ${args.join(' ')} failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`,
        {
          cause: err,
        },
      );
    }
  };
  run('db:migrate');
  run('db:seed', '--seed', '20261025000101-plans.cjs');
}
