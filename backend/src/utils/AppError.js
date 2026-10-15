/**
 * AppError.js — our own error classes for EXPECTED failures (bad input, not found, no permission...).
 *
 * How to use (usually in services):
 *   throw new NotFoundError('Habit not found');
 *   throw new ConflictError('Email already registered', { code: 'EMAIL_TAKEN' });
 *   throw new ValidationError('Date is in the future', { code: 'DATE_NOT_COMPLETABLE' });
 *
 * The error handler (middleware/errorHandler.js) turns them into a response like:
 *   HTTP 409  { "error": { "code": "EMAIL_TAKEN", "message": "Email already registered" } }
 *
 * Each subclass fixes the HTTP status (you can't accidentally send a 404 as a 500).
 * You CAN override `code` (a machine-readable SCREAMING_SNAKE_CASE string the frontend can
 * switch on) and add `details` (extra data, e.g. which fields failed).
 *
 * Unexpected errors (bugs) should NOT use these classes; just let them throw. They become a
 * generic 500 response and are logged.
 */

/** Base class. All other errors in this file extend it. */
export class AppError extends Error {
  /**
   * @param {string} message human-readable text, safe to show to the client
   * @param {object} [options]
   * @param {number} [options.status] HTTP status code
   * @param {string} [options.code] machine-readable error code
   * @param {unknown} [options.details] extra info for the client (e.g. field errors)
   * @param {unknown} [options.cause] the original error, kept for debugging/logging
   */
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    // new.target is the class actually being constructed, so a NotFoundError gets
    // name "NotFoundError" (helpful in logs and stack traces).
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// In each subclass below, `{ code: '...', ...options, status: N }` means:
//   - code: a default the caller may override via options,
//   - status: always N (it comes last, so options can't override it).

/** 400: the request itself is malformed. */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', options = {}) {
    super(message, { code: 'BAD_REQUEST', ...options, status: 400 });
  }
}

/** 401: the user is not logged in (no session, or an expired/invalid one). */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', options = {}) {
    super(message, { code: 'UNAUTHENTICATED', ...options, status: 401 });
  }
}

/** 403: the user is logged in but not allowed to do this (e.g. bad CSRF token, plan limit). */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', options = {}) {
    super(message, { code: 'FORBIDDEN', ...options, status: 403 });
  }
}

/** 404: the resource doesn't exist, OR it belongs to someone else (we never reveal which). */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', options = {}) {
    super(message, { code: 'NOT_FOUND', ...options, status: 404 });
  }
}

/** 409: the request conflicts with current data (duplicate email, habit already archived...). */
export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with the current state', options = {}) {
    super(message, { code: 'CONFLICT', ...options, status: 409 });
  }
}

/**
 * 422: the input is well-formed but not acceptable. Used both for schema validation failures
 * (code VALIDATION_ERROR) and for business-rule violations (pass a specific code).
 */
export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', options = {}) {
    super(message, { code: 'VALIDATION_ERROR', ...options, status: 422 });
  }
}

/** 429: the client sent too many requests in a short time (see middleware/rateLimit.js). */
export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests, please try again later', options = {}) {
    super(message, { code: 'RATE_LIMITED', ...options, status: 429 });
  }
}
