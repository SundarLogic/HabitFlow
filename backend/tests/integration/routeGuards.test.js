/**
 * Route guards for EVERY /api/v1 route, found by walking the real Express routers (not a hand-kept
 * list), so a route added without protection fails this test.
 *
 * Rules (CLAUDE.md §4.1):
 *   - Only health, signup, login and the CSRF bootstrap are public. Every other route runs
 *     requireAuth, then csrfProtection (a no-op for GET, but always in the chain).
 *   - Workspace-scoped features also run resolveWorkspace, after requireAuth.
 *   - Behaviour matches: no session -> 401 everywhere; a cookie session without the CSRF header
 *     -> 403 on every unsafe method.
 */
import request from 'supertest';
import { requireAuth } from '../../src/middleware/auth.js';
import { csrfProtection } from '../../src/middleware/csrf.js';
import { resolveWorkspace } from '../../src/middleware/workspace.js';
import { apiMounts } from '../../src/routes/index.js';
import { createTestApp, seedPlans, signupAgent } from '../helpers/auth.js';
import { truncateAllTables } from '../helpers/db.js';

const PUBLIC = new Set(['GET /health', 'POST /auth/signup', 'POST /auth/login', 'GET /auth/csrf']);
/** Features that are per user, not per workspace (notifications, account, workspace list). */
const NOT_WORKSPACE_SCOPED = ['/auth', '/users', '/workspaces', '/notifications'];

/**
 * Every route as { method, path, chain }, where chain is the list of middleware functions that
 * run before the controller: the router-level `router.use(...)` layers declared BEFORE the route,
 * then the route's own handlers. Reads Express 5 internals: router.stack holds Layers; a Layer
 * with `.route` is a route (its own `.stack` has the handlers, each with `.method`).
 */
function collectRoutes() {
  const routes = [];
  for (const [prefix, router] of apiMounts({ authRateLimit: { windowMs: 1000, limit: 1000 } })) {
    const inherited = [];
    for (const layer of router.stack) {
      if (!layer.route) {
        inherited.push(layer.handle);
        continue;
      }
      const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}`;
      for (const method of Object.keys(layer.route.methods)) {
        const own = layer.route.stack.filter((l) => !l.method || l.method === method);
        routes.push({
          method: method.toUpperCase(),
          path,
          chain: [...inherited, ...own.map((l) => l.handle)],
        });
      }
    }
  }
  return routes;
}

const routes = collectRoutes();
const label = (r) => `${r.method} ${r.path}`;
const protectedRoutes = routes.filter((r) => !PUBLIC.has(label(r)));
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** A concrete URL for a route pattern (any valid id/date: the guards answer before lookups). */
const urlFor = (path) =>
  `/api/v1${path
    .replace(':date', '2026-01-01')
    .replace(/:id/g, '3f2c9a1e-0000-4000-8000-000000000000')}`;

it('finds every route (guards against an empty walk)', () => {
  // 34 operations in docs/openapi.yaml.
  expect(routes).toHaveLength(34);
  for (const name of PUBLIC) expect(routes.map(label)).toContain(name);
});

describe.each(protectedRoutes.map((r) => [label(r), r]))('%s', (_, route) => {
  it('runs requireAuth, then csrfProtection', () => {
    const auth = route.chain.indexOf(requireAuth);
    const csrf = route.chain.indexOf(csrfProtection);
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(csrf).toBeGreaterThan(auth);
  });

  const scoped = !NOT_WORKSPACE_SCOPED.some((prefix) => route.path.startsWith(prefix));
  if (scoped) {
    it('runs resolveWorkspace after authentication', () => {
      expect(route.chain.indexOf(resolveWorkspace)).toBeGreaterThan(
        route.chain.indexOf(requireAuth),
      );
    });
  }
});

describe('behaviour', () => {
  const app = createTestApp();

  beforeAll(seedPlans);
  beforeEach(() => truncateAllTables({ except: ['plans'] }));

  it('answers 401 UNAUTHENTICATED on every protected route without a session', async () => {
    const results = [];
    for (const route of protectedRoutes) {
      const res = await request(app)[route.method.toLowerCase()](urlFor(route.path)).send({});
      results.push([label(route), res.status, res.body.error?.code]);
    }
    expect(
      results.filter(([, status, code]) => status !== 401 || code !== 'UNAUTHENTICATED'),
    ).toEqual([]);
  });

  it('answers 403 CSRF_TOKEN_INVALID on every unsafe route without the CSRF header', async () => {
    const { agent } = await signupAgent(app);
    const results = [];
    for (const route of protectedRoutes.filter((r) => UNSAFE.has(r.method))) {
      const res = await agent[route.method.toLowerCase()](urlFor(route.path)).send({});
      results.push([label(route), res.status, res.body.error?.code]);
    }
    expect(results.length).toBeGreaterThan(10);
    expect(
      results.filter(([, status, code]) => status !== 403 || code !== 'CSRF_TOKEN_INVALID'),
    ).toEqual([]);
  });
});
