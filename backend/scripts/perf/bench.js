/**
 * Performance benchmark (Phase 11): `npm run perf:bench` after `npm run perf:seed`.
 *
 * Starts the real app on a random local port, logs in as perf-0@habitflow.local and, for each
 * read-heavy endpoint:
 *   1. captures the SQL it sends (Sequelize logging) and prints EXPLAIN (ANALYZE) of each query,
 *      flagging sequential scans on big tables;
 *   2. sends WARMUP + RUNS sequential requests and reports p50 / p95 / max latency.
 * The target is p95 < 200 ms locally. Exit code 1 if an endpoint misses it.
 *
 * Options (env): PERF_RUNS (default 100), PERF_EXPLAIN=0 to skip the plans.
 */
import { DateTime } from 'luxon';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';
import { env } from '../../src/config/env.js';
import { sequelize } from '../../src/models/index.js';

if (env.NODE_ENV !== 'development') throw new Error('perf:bench runs against the development DB');

const RUNS = Number(process.env.PERF_RUNS ?? 100);
const WARMUP = 10;
const TARGET_MS = 200;
const BIG_TABLES = ['habit_completions', 'habits', 'habit_schedule_days', 'habit_reminders'];

const app = createApp({
  logger: createLogger({ level: 'silent' }),
  rateLimits: { api: { windowMs: 60_000, limit: 1_000_000 } },
});
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'perf-0@habitflow.local', password: 'habitflow-perf' }),
});
if (login.status !== 200) throw new Error('Run `npm run perf:seed` first (login failed).');
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
const get = (path) => fetch(`${base}${path}`, { headers: { Cookie: cookie } });

const habits = await (await get('/habits?limit=100')).json();
const habitId = habits.data[0].id;
const today = DateTime.now().setZone('America/New_York').toISODate();
const yearAgo = DateTime.fromISO(today).minus({ days: 365 }).toISODate();

const ENDPOINTS = [
  ['GET /today', '/today'],
  ['GET /habits', '/habits?limit=100'],
  ['GET /habits/:id', `/habits/${habitId}`],
  ['GET /analytics/summary (30 days)', '/analytics/summary'],
  ['GET /analytics/summary (366 days)', `/analytics/summary?from=${yearAgo}&to=${today}`],
  ['GET /analytics/heatmap (year)', '/analytics/heatmap'],
  ['GET /habits/:id/history (30 days)', `/habits/${habitId}/history`],
  ['GET /completions (366 days, page 1)', `/completions?from=${yearAgo}&to=${today}`],
  ['GET /completions (366 days, page 50)', `/completions?from=${yearAgo}&to=${today}&page=50`],
];

/** The SQL statements one request sends. */
async function captureSql(path) {
  const statements = [];
  sequelize.options.logging = (sql) => statements.push(sql.replace(/^Executing \(.*?\): /, ''));
  await (await get(path)).arrayBuffer();
  sequelize.options.logging = false;
  // Only the endpoint's own reads; the session lookup/touch is the same for every route.
  return statements.filter((sql) => /^SELECT/i.test(sql) && !/FROM "sessions"/.test(sql));
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const results = [];
const out = (line = '') => process.stdout.write(`${line}\n`);

for (const [name, path] of ENDPOINTS) {
  out(`\n## ${name}`);
  if (process.env.PERF_EXPLAIN !== '0') {
    for (const sql of await captureSql(path)) {
      const [rows] = await sequelize.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
      const plan = rows.map((r) => r['QUERY PLAN']);
      const seqScans = plan.filter((l) => BIG_TABLES.some((t) => l.includes(`Seq Scan on ${t}`)));
      const time = plan.find((l) => l.startsWith('Execution Time'));
      out(`  ${sql.slice(0, 110).replace(/\s+/g, ' ')}...`);
      for (const line of plan.filter((l) => /Scan|Execution Time/.test(l)))
        out(`    ${line.trim()}`);
      if (seqScans.length) out(`    !! sequential scan on a large table (${time})`);
    }
  }
  for (let i = 0; i < WARMUP; i += 1) await (await get(path)).arrayBuffer();
  const times = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    const res = await get(path);
    await res.arrayBuffer();
    if (res.status !== 200) throw new Error(`${name}: HTTP ${res.status}`);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  results.push({
    endpoint: name,
    p50: +percentile(times, 0.5).toFixed(1),
    p95: +percentile(times, 0.95).toFixed(1),
    max: +times.at(-1).toFixed(1),
  });
}

out(`\n## Latency over ${RUNS} sequential requests (ms)`);
out('| Endpoint | p50 | p95 | max |');
out('|---|---|---|---|');
for (const r of results) out(`| ${r.endpoint} | ${r.p50} | ${r.p95} | ${r.max} |`);
const slow = results.filter((r) => r.p95 >= TARGET_MS);
out(
  slow.length
    ? `\nOVER TARGET (p95 >= ${TARGET_MS} ms): ${slow.map((r) => r.endpoint).join(', ')}`
    : `\nAll endpoints p95 < ${TARGET_MS} ms.`,
);

server.close();
await sequelize.close();
process.exitCode = slow.length ? 1 : 0;
