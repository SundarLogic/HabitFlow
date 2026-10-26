/**
 * Interactive API docs (Swagger UI) at /api/docs, for development only (ADR-059).
 * app.js mounts this router when NODE_ENV is not production, so the docs are never public.
 *
 *   /api/docs                 the Swagger UI page (from the swagger-ui-dist package)
 *   /api/docs/openapi.yaml    the spec, docs/openapi.yaml in the repository
 *
 * swagger-ui-dist is a DEV dependency: it is imported on the first request, not at start-up,
 * so production installs (npm ci --omit=dev) never need it. Its files are served from our own
 * origin, so the default helmet Content-Security-Policy (script-src 'self') allows them.
 * "Try it out" works with the session cookie for GETs; for writes, use Authorize -> bearerAuth
 * with your session token (Bearer requests need no CSRF header).
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import { NotFoundError } from '../utils/AppError.js';

const SPEC_FILE = fileURLToPath(new URL('../../../docs/openapi.yaml', import.meta.url));

// Replaces the package's default initializer (which loads the "Petstore" demo spec).
const INITIALIZER = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/api/docs/openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
};
`;

/** Loads swagger-ui-dist once and builds the static file middleware for it. */
let staticFiles;
async function swaggerStatic() {
  if (!staticFiles) {
    const { default: swaggerUiDist } = await import('swagger-ui-dist');
    staticFiles = express.static(swaggerUiDist.getAbsoluteFSPath(), { index: 'index.html' });
  }
  return staticFiles;
}

/** @returns {import('express').Router} */
export function createDocsRouter() {
  const router = Router();

  router.get('/openapi.yaml', (req, res) => {
    if (!existsSync(SPEC_FILE)) throw new NotFoundError('docs/openapi.yaml is not available');
    res.type('text/yaml').sendFile(SPEC_FILE);
  });

  router.get('/swagger-initializer.js', (req, res) => {
    res.type('application/javascript').send(INITIALIZER);
  });

  // Everything else (index.html, CSS, JS bundles) comes from the package. "/api/docs" without
  // a trailing slash would break the page's relative links, so redirect it first.
  router.use(async (req, res, next) => {
    if (req.path === '/' && !req.originalUrl.split('?')[0].endsWith('/')) {
      res.redirect(301, `${req.baseUrl}/`);
      return;
    }
    (await swaggerStatic())(req, res, next);
  });

  return router;
}
