/**
 * server.js — the entry point that actually starts the API (`npm run dev` / `npm start`).
 *
 * Responsibilities:
 *   1. Create the Express app (from app.js) and listen on PORT.
 *   2. Check the database connection once at startup (warn if it is down).
 *   3. Shut down "gracefully" when asked to stop (Ctrl+C, Docker stop, deployment restart):
 *      stop accepting new requests, let in-flight requests finish, close DB connections, exit.
 *   4. Crash loudly (and log why) on programming errors nobody handled, instead of running on
 *      in an unknown, possibly broken state.
 */
import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { sequelize } from './models/index.js';

// If graceful shutdown takes longer than this, we give up and force the process to exit.
const SHUTDOWN_TIMEOUT_MS = 10_000;

// --- Safety nets for errors that escaped all our try/catch blocks -------------------------
// A promise rejected and nobody awaited/caught it. This is a bug, so log it and exit.
// (In production a process manager such as Docker or PM2 restarts the app.)
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
// A synchronous error was thrown and never caught. Same treatment.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

// --- Start the HTTP server ------------------------------------------------------------------
// We create the server with node:http (instead of app.listen) so we can attach an
// 'error' listener and call server.close() during shutdown.
const server = http.createServer(createApp());

// Fires if the server cannot start, e.g. "EADDRINUSE" = another program already uses PORT.
server.on('error', (err) => {
  logger.fatal({ err }, 'HTTP server error');
  process.exit(1);
});

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'HabitFlow API listening');
});

// --- Startup database check -----------------------------------------------------------------
// This file is an ES module, so we can use `await` at the top level.
try {
  await sequelize.authenticate(); // opens a connection and runs a trivial query
  logger.info('Database connection verified');
} catch (err) {
  // Not fatal on purpose: the API keeps running and /api/v1/health reports db: "down"
  // until PostgreSQL becomes reachable (e.g. Docker is still starting).
  // We log only the message (not the full error) to avoid leaking connection details.
  logger.warn({ err: { message: err.message } }, 'Database is not reachable at startup');
}

// --- Graceful shutdown ----------------------------------------------------------------------
// Guard so that pressing Ctrl+C twice does not run the shutdown steps twice.
let shuttingDown = false;

/**
 * Stops the server cleanly.
 * @param {string} signal the OS signal that triggered shutdown, e.g. 'SIGTERM'
 */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  // Fallback timer: if something hangs (e.g. a request that never finishes), exit anyway.
  // unref() means "don't keep the process alive just because this timer exists".
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // server.close() stops accepting new connections and calls back once existing ones finish.
    // It uses a callback, so we wrap it in a Promise to be able to `await` it.
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    // Close all pooled database connections so PostgreSQL is not left with dangling sessions.
    await sequelize.close();
    logger.info('Shutdown complete');
    process.exit(0); // 0 = success
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1); // non-zero = failure
  }
}

// SIGTERM: sent by Docker / Kubernetes / hosting platforms when stopping the app.
// SIGINT:  sent when you press Ctrl+C in the terminal.
// `void` marks that we intentionally don't await here (shutdown handles its own errors).
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
