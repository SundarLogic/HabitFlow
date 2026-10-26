/**
 * errorHandler.js — turns every error into a consistent JSON response.
 *
 * Every error the API returns has the same shape, so the frontend handles errors one way:
 *   { "error": { "code": "SOME_CODE", "message": "Human readable text", "details": <optional> } }
 *
 * Flow: a controller/service/middleware throws (or calls next(err))
 *       -> Express skips to errorHandler
 *       -> toAppError() decides status + code + safe message
 *       -> errorHandler sends the JSON.
 *
 * Security rule: unexpected errors (bugs, database outages) become a generic
 * 500 "Internal server error". Internal details and stack traces are never sent to clients
 * (except the stack in local development, to help debugging). The full error is still logged.
 */
import {
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError, // renamed to avoid clashing with our own ValidationError
} from 'sequelize';
import { env } from '../config/env.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../utils/AppError.js';

/**
 * Converts ANY thrown value into an AppError with an HTTP status, a code, and a message that is
 * safe to show to the client. Exported separately so it can be unit-tested.
 *
 * @param {unknown} err whatever was thrown
 * @returns {AppError}
 */
export function toAppError(err) {
  // Our own errors (NotFoundError, ConflictError, ...) already have status/code/message.
  if (err instanceof AppError) return err;

  // --- Database constraint errors (raised by PostgreSQL, wrapped by Sequelize) -----------

  // UNIQUE constraint violated, e.g. registering an email that already exists.
  // Order matters: UniqueConstraintError is a subclass of Sequelize's ValidationError,
  // so this check must come before the generic SequelizeValidationError check below.
  if (err instanceof UniqueConstraintError) {
    return new ConflictError('This already exists. Refresh the page to see the latest data.', {
      code: 'UNIQUE_VIOLATION',
      // Only field NAMES (e.g. ['email']), never the values, which could be personal data.
      details: { fields: Object.keys(err.fields ?? {}) },
    });
  }

  // FOREIGN KEY constraint violated. Two different situations:
  if (err instanceof ForeignKeyConstraintError) {
    const detail = err.parent?.detail ?? ''; // PostgreSQL's explanation text
    // a) Deleting a row that other rows still point to -> 409 Conflict.
    if (detail.includes('is still referenced')) {
      return new ConflictError("This can't be deleted because other data still depends on it.", {
        code: 'RESOURCE_IN_USE',
      });
    }
    // b) Inserting/updating a row that points to a row that doesn't exist -> 422.
    return new ValidationError(
      'Something this refers to no longer exists. Refresh the page and try again.',
      {
        code: 'INVALID_REFERENCE',
      },
    );
  }

  // Validation rules defined on Sequelize models (e.g. allowNull: false) failed.
  if (err instanceof SequelizeValidationError) {
    return new ValidationError('Request validation failed', {
      details: err.errors.map((item) => ({ path: item.path, message: item.message })),
    });
  }

  // --- Errors from express.json() (the body parser) ------------------------------------
  // The client sent a body that isn't valid JSON, e.g. '{"name": "oops",'.
  if (err?.type === 'entity.parse.failed') {
    return new AppError('Request body is not valid JSON', { status: 400, code: 'INVALID_JSON' });
  }
  // The body is bigger than the 100kb limit set in app.js.
  if (err?.type === 'entity.too.large') {
    return new AppError('Request body is too large', { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  // Other 4xx errors from Express libraries that mark their message as safe to show (expose).
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 && err.expose) {
    return new AppError(err.message, { status: err.status, code: 'BAD_REQUEST' });
  }

  // Anything else is unexpected: hide the details from the client.
  return new AppError('Internal server error', { status: 500, code: 'INTERNAL_ERROR' });
}

/**
 * Catch-all for requests that matched no route. Registered after all routes in app.js.
 * Produces 404 { error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/xyz not found' } }.
 */
export function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}

/**
 * The central error-handling middleware.
 *
 * Express recognises error-handling middleware by its FOUR parameters (err, req, res, next),
 * so keep all four even though `next` is rarely used.
 */
export function errorHandler(err, req, res, next) {
  // If part of the response was already sent we can't send a new one; let Express's
  // default handler close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = toAppError(err);

  if (appError.status >= 500) {
    // Attach the ORIGINAL error so the request logger (pino-http) writes it to the logs at
    // "error" level. The client never sees it; developers find it in the logs.
    res.err = err;
  }

  const body = { error: { code: appError.code, message: appError.message } };
  if (appError.details !== undefined) body.error.details = appError.details;
  // In local development only, include the stack trace to speed up debugging.
  if (env.NODE_ENV === 'development' && appError.status >= 500) body.error.stack = err?.stack;

  res.status(appError.status).json(body);
}
