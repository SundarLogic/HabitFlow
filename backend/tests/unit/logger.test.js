/**
 * Unit test for log redaction: secrets (passwords, tokens, cookies, SQL) must never be written
 * to logs. We point a logger at an in-memory stream, log an object full of secrets, and check
 * that the captured output contains "[REDACTED]" instead of the secret values.
 */
import { Writable } from 'node:stream';
import { createLogger } from '../../src/config/logger.js';

function captureLogger() {
  const lines = [];
  const destination = new Writable({
    write(chunk, encoding, callback) {
      lines.push(JSON.parse(chunk.toString()));
      callback();
    },
  });
  return { logger: createLogger({ level: 'info', destination }), lines };
}

describe('logger redaction', () => {
  it('redacts credentials, tokens, cookies and SQL', () => {
    const { logger, lines } = captureLogger();

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer abc',
            cookie: 'hf_session=abc',
            'x-csrf-token': 'csrf',
            accept: 'application/json',
          },
        },
        res: { headers: { 'set-cookie': 'hf_session=abc' } },
        body: { email: 'a@b.com', password: 'hunter2' },
        session: { token: 'raw-token', tokenHash: 'hash' },
        err: {
          message: 'boom',
          sql: 'INSERT ... hunter2',
          parent: { sql: 'x', parameters: ['p'] },
        },
      },
      'request',
    );

    const [entry] = lines;
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/hunter2|Bearer abc|hf_session=abc|raw-token|"csrf"/);
    expect(entry.req.headers.accept).toBe('application/json');
    expect(entry.body.email).toBe('a@b.com');
    expect(entry.body.password).toBe('[REDACTED]');
    expect(entry.err.message).toBe('boom');
  });
});
