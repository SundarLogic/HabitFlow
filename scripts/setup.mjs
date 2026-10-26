/**
 * One-time local setup: `node scripts/setup.mjs` from the repository root.
 *
 *   1. copies .env.example -> .env (root and backend/) when a .env doesn't exist yet
 *      (the templates share the same local-only database password, so they work together)
 *   2. starts PostgreSQL with Docker and waits until it is healthy
 *   3. installs backend and frontend dependencies (npm ci)
 *   4. migrates the development database and seeds plans + demo data
 *
 * Safe to run again: existing .env files are never overwritten, and migrations/seeders are
 * idempotent. Needs Node 20+ and Docker. Port 5432 taken? Set POSTGRES_PORT in .env and
 * DB_PORT / TEST_DATABASE_URL in backend/.env to the same free port, then run it again.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function step(title, command, cwd = '.') {
  process.stdout.write(`\n> ${title}\n  $ ${command}\n`);
  execSync(command, { cwd: path.join(root, cwd), stdio: 'inherit' });
}

for (const dir of ['.', 'backend']) {
  const target = path.join(root, dir, '.env');
  if (existsSync(target)) {
    process.stdout.write(`\n> ${path.join(dir, '.env')} already exists, keeping it\n`);
  } else {
    copyFileSync(path.join(root, dir, '.env.example'), target);
    process.stdout.write(`\n> Created ${path.join(dir, '.env')} from .env.example\n`);
  }
}

step('Start PostgreSQL (Docker)', 'docker compose up -d --wait');
step('Install backend dependencies', 'npm ci', 'backend');
step('Install frontend dependencies', 'npm ci', 'frontend');
step('Create the database tables', 'npm run db:migrate', 'backend');
step('Add plans and demo data', 'npm run db:seed', 'backend');

process.stdout.write(`
Done. Start the app in two terminals:
  npm --prefix backend run dev     # API  http://localhost:3000/api/v1/health
  npm --prefix frontend run dev    # Web  http://localhost:5173
Log in as demo@habitflow.local / habitflow-demo
`);
