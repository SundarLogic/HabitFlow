/**
 * Guards for frontend/vercel.json (the production hosting config, docs/DEPLOYMENT.md):
 *   - /api/* is rewritten to the API BEFORE the SPA fallback (otherwise API calls get index.html);
 *   - the Content-Security-Policy allows the inline theme script in index.html by its SHA-256
 *     hash. Editing that script changes the hash: this test then prints the new value to paste
 *     into vercel.json, so production never silently blocks it (dark mode would flash);
 *   - clickjacking protection and long-term caching of the hashed /assets files.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Vitest runs from frontend/ (under jsdom, import.meta.url isn't a file URL).
const read = (file) => readFileSync(path.resolve(file), 'utf8');
const config = JSON.parse(read('vercel.json'));
const headerValue = (key) =>
  config.headers.flatMap((rule) => rule.headers).find((h) => h.key === key)?.value;

it('rewrites /api/* to the API first, then everything else to index.html', () => {
  expect(config.rewrites).toHaveLength(2);
  expect(config.rewrites[0].source).toBe('/api/(.*)');
  expect(config.rewrites[0].destination).toMatch(/^https:\/\/[^/]+\/api\/\$1$/);
  expect(config.rewrites[1]).toEqual({ source: '/(.*)', destination: '/index.html' });
});

it('allows every inline script of index.html by hash, and nothing else inline', () => {
  const csp = headerValue('Content-Security-Policy');
  const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
  const inline = [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)];
  expect(inline.length).toBeGreaterThan(0);
  for (const [, body] of inline) {
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    expect(scriptSrc, `put ${hash} in vercel.json script-src`).toContain(hash);
  }
  expect(scriptSrc).not.toContain('unsafe-inline');
});

it('forbids framing and caches hashed assets for a year', () => {
  expect(headerValue('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
  const assets = config.headers.find((rule) => rule.source === '/assets/(.*)');
  expect(assets.headers[0].value).toBe('public, max-age=31536000, immutable');
});
