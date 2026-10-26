/**
 * Run by tests/integration/production.test.js in a CHILD process with NODE_ENV=production
 * (env.js is read once per process, so production behaviour can't be switched on inside Jest).
 * It exercises the real app and prints one JSON object describing what a production client sees:
 * cookie flags, security headers, CORS answers, and the bodies of unexpected / SQL errors.
 *
 * DATABASE_URL points at the test database; the probe only creates one throwaway user.
 */
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { sequelize } from '../../src/models/index.js';

const app = createApp();
const out = {};

const signup = await request(app)
  .post('/api/v1/auth/signup')
  .send({
    name: 'Prod Probe',
    email: `probe-${Date.now()}@example.com`,
    password: 'probe-pass-42',
  });
out.signupStatus = signup.status;
out.setCookie = signup.headers['set-cookie'];

const health = await request(app).get('/api/v1/health');
out.headers = health.headers;

const allowed = await request(app)
  .options('/api/v1/auth/me')
  .set('Origin', 'https://app.example.com')
  .set('Access-Control-Request-Method', 'GET');
out.corsAllowed = allowed.headers['access-control-allow-origin'] ?? null;
const denied = await request(app)
  .options('/api/v1/auth/me')
  .set('Origin', 'https://evil.example.net')
  .set('Access-Control-Request-Method', 'GET');
out.corsDenied = denied.headers['access-control-allow-origin'] ?? null;

out.tooLarge = (
  await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(150_000) }))
).body;

// Unexpected errors behind the real error handler: a plain throw and a real failing SQL query.
const failing = express();
failing.get('/boom', () => {
  throw new Error('internal detail: secret-path /etc/app');
});
failing.get('/sql', async () => {
  await sequelize.query('SELECT secret_column FROM no_such_table_xyz');
});
failing.use(errorHandler);
out.boom = (await request(failing).get('/boom')).body;
out.sql = (await request(failing).get('/sql')).body;

await sequelize.close();
process.stdout.write(JSON.stringify(out));
