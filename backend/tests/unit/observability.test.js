/**
 * Observability helpers (src/observability/): slow-query logging never logs literal values, and
 * error tracking scrubs personal data and sends ids only.
 */
import { createLogger } from '../../src/config/logger.js';
import {
  captureError,
  flushErrorTracking,
  initErrorTracking,
  scrubEvent,
  setErrorTrackingClient,
} from '../../src/observability/errorTracking.js';
import { createSlowQueryLogger, redactSql } from '../../src/observability/slowQueries.js';

/** A logger whose output lines are collected (as parsed JSON) in `lines`. */
function captureLogger() {
  const lines = [];
  const logger = createLogger({
    level: 'info',
    destination: { write: (l) => lines.push(JSON.parse(l)) },
  });
  return { logger, lines };
}

describe('slow-query logging', () => {
  it('redactSql removes string literals and long numbers, keeping the query shape', () => {
    const sql =
      'Executing (default): SELECT * FROM "users" WHERE "email" = \'ana@example.com\' AND "x" = \'it\'\'s\' LIMIT 1 OFFSET 20261026;';
    expect(redactSql(sql)).toBe(
      'SELECT * FROM "users" WHERE "email" = \'?\' AND "x" = \'?\' LIMIT 1 OFFSET ?;',
    );
  });

  it('logs only queries at or over the threshold, at warn level, without values', () => {
    const { logger, lines } = captureLogger();
    const log = createSlowQueryLogger({ logger, thresholdMs: 500 });
    log("SELECT 1 WHERE a = 'fast'", 12);
    log("INSERT INTO users (password_hash) VALUES ('$2b$12$secret-hash')", 750);
    log('no timing', undefined);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 40, durationMs: 750, msg: 'Slow database query' });
    expect(lines[0].sql).toBe("INSERT INTO users (password_hash) VALUES ('?')");
    expect(JSON.stringify(lines)).not.toContain('secret-hash');
  });
});

describe('error tracking', () => {
  afterEach(() => setErrorTrackingClient(null));

  it('scrubEvent drops cookies, auth headers, bodies, query strings, IPs and user details', () => {
    const event = scrubEvent({
      request: {
        url: 'https://habitflow.app/api/v1/habits?search=private',
        cookies: { hf_session: 'token' },
        data: '{"password":"hunter2"}',
        query_string: 'search=private',
        headers: {
          Cookie: 'hf_session=token',
          Authorization: 'Bearer t',
          'X-CSRF-Token': 'c',
          Accept: 'application/json',
        },
      },
      user: { id: 'u1', email: 'ana@example.com', ip_address: '203.0.113.7' },
    });
    expect(event.request).toEqual({
      url: 'https://habitflow.app/api/v1/habits',
      headers: { Accept: 'application/json' },
    });
    expect(event.user).toEqual({ id: 'u1' });
  });

  it('is a no-op without a client, and reports ids and the route when one is set', () => {
    expect(() => captureError(new Error('x'))).not.toThrow();

    const calls = [];
    const scope = {
      setTag: (key, value) => calls.push(['tag', key, value]),
      setUser: (user) => calls.push(['user', user]),
    };
    setErrorTrackingClient({
      withScope: (fn) => fn(scope),
      captureException: (err) => calls.push(['exception', err.message]),
    });
    captureError(new Error('boom'), {
      requestId: 'r1',
      userId: 'u1',
      method: 'GET',
      route: '/api/v1/today',
    });
    expect(calls).toEqual([
      ['tag', 'requestId', 'r1'],
      ['tag', 'method', 'GET'],
      ['tag', 'route', '/api/v1/today'],
      ['user', { id: 'u1' }],
      ['exception', 'boom'],
    ]);
  });

  it('stays off without SENTRY_DSN, and warns (without failing) if @sentry/node is missing', async () => {
    const { logger, lines } = captureLogger();
    expect(await initErrorTracking({ logger, dsn: undefined })).toBe(false);
    expect(lines).toHaveLength(0);

    expect(await initErrorTracking({ logger, dsn: 'https://key@example.ingest.sentry.io/1' })).toBe(
      false,
    );
    expect(lines[0]).toMatchObject({ level: 40 });
    expect(lines[0].msg).toContain('npm install @sentry/node');
    expect(JSON.stringify(lines)).not.toContain('key@example'); // the DSN itself is not logged
  });

  it('flushes queued events before exit when a client is set', async () => {
    await expect(flushErrorTracking()).resolves.toBeUndefined(); // no client: nothing to do
    const flushed = [];
    setErrorTrackingClient({ flush: (ms) => Promise.resolve(flushed.push(ms)) });
    await flushErrorTracking(1500);
    expect(flushed).toEqual([1500]);
  });
});
