/**
 * Unit tests for our error classes (src/utils/AppError.js) and for toAppError(), which converts
 * any thrown value into an HTTP status + error code + safe message.
 */
import { ForeignKeyConstraintError, UniqueConstraintError } from 'sequelize';
import { toAppError } from '../../src/middleware/errorHandler.js';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '../../src/utils/AppError.js';

describe('AppError subclasses', () => {
  it.each([
    [BadRequestError, 400, 'BAD_REQUEST'],
    [UnauthorizedError, 401, 'UNAUTHENTICATED'],
    [ForbiddenError, 403, 'FORBIDDEN'],
    [NotFoundError, 404, 'NOT_FOUND'],
    [ConflictError, 409, 'CONFLICT'],
    [ValidationError, 422, 'VALIDATION_ERROR'],
    [RateLimitedError, 429, 'RATE_LIMITED'],
  ])('%p has status %i and default code %s', (ErrorClass, status, code) => {
    const err = new ErrorClass();

    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status, code, name: ErrorClass.name });
  });

  it('allows overriding code and details but not status', () => {
    const err = new ConflictError('taken', {
      code: 'EMAIL_TAKEN',
      details: { field: 'email' },
      status: 500,
    });

    expect(err).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', details: { field: 'email' } });
  });
});

describe('toAppError', () => {
  it('passes AppErrors through unchanged', () => {
    const err = new NotFoundError();
    expect(toAppError(err)).toBe(err);
  });

  it('maps UniqueConstraintError to 409 with field names only (no values)', () => {
    const result = toAppError(new UniqueConstraintError({ fields: { email: 'a@b.com' } }));

    expect(result).toMatchObject({
      status: 409,
      code: 'UNIQUE_VIOLATION',
      details: { fields: ['email'] },
    });
    expect(JSON.stringify(result.details)).not.toContain('a@b.com');
  });

  it('maps a foreign key violation on insert/update to 422 INVALID_REFERENCE', () => {
    const err = new ForeignKeyConstraintError({
      parent: { detail: 'Key (habit_id)=(x) is not present in table "habits".' },
    });
    expect(toAppError(err)).toMatchObject({ status: 422, code: 'INVALID_REFERENCE' });
  });

  it('maps a foreign key violation on delete to 409 RESOURCE_IN_USE', () => {
    const err = new ForeignKeyConstraintError({
      parent: { detail: 'Key (id)=(x) is still referenced from table "habit_completions".' },
    });
    expect(toAppError(err)).toMatchObject({ status: 409, code: 'RESOURCE_IN_USE' });
  });

  it('maps body-parser errors', () => {
    expect(toAppError({ type: 'entity.parse.failed', status: 400 })).toMatchObject({
      status: 400,
      code: 'INVALID_JSON',
    });
    expect(toAppError({ type: 'entity.too.large', status: 413 })).toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('maps anything else to a generic 500', () => {
    const result = toAppError(new TypeError('cannot read x of undefined'));

    expect(result).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
