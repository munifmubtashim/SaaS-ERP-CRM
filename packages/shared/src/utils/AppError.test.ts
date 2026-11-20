import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apiErrorSchema, ERROR_CODES, errorCodeSchema, fieldErrorSchema } from '../schemas/error.schema.js';
import { AppError, ERROR_STATUS } from './AppError.js';

/**
 * The API error contract (CLAUDE.md: errors are always {code, message, fields[], requestId}; stable machine
 * codes). errorMiddleware is the only place that turns an AppError into a response; these tests pin the parts
 * of the contract that live in shared.
 */

const codeArb = fc.constantFrom(...ERROR_CODES);
const fieldArb = fc.record({ path: fc.string(), code: fc.string(), message: fc.string() });

describe('AppError', () => {
  it('is a real Error with a stack, a name and the code, message and fields it was given', () => {
    const fields = [{ path: 'lines.0.qty', code: 'too_small', message: 'Quantity must be positive' }];
    const err = new AppError('VALIDATION_FAILED', 'Invalid input', fields);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fields).toEqual(fields);
    expect(err.stack).toContain('AppError');
  });

  it('defaults fields to an empty list, and two errors never share that list', () => {
    const a = new AppError('NOT_FOUND', 'a');
    const b = new AppError('NOT_FOUND', 'b');
    expect(a.fields).toEqual([]);
    expect(a.fields).not.toBe(b.fields);
  });

  it('is thrown with its code, so a caller can tell it from any other Error', () => {
    const thrower = (): never => {
      throw new AppError('CONFLICT', 'Already posted');
    };
    expect(thrower).toThrow(AppError);
    expect(thrower).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    expect(() => {
      throw new Error('plain');
    }).not.toThrow(AppError);
  });
});

describe('ERROR_CODES and ERROR_STATUS', () => {
  it('lists each code once, in UPPER_SNAKE_CASE', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
  });

  it('has a status for exactly the known codes, no more and no fewer', () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('maps each code to its documented HTTP status', () => {
    expect(ERROR_STATUS).toEqual({
      VALIDATION_FAILED: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
      SERVICE_UNAVAILABLE: 503,
    });
  });

  it('gives server faults a 5xx and everything else a 4xx', () => {
    const serverFaults = new Set(['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']);
    for (const code of ERROR_CODES) {
      const status = ERROR_STATUS[code];
      if (serverFaults.has(code)) expect(status).toBeGreaterThanOrEqual(500);
      else expect(status).toBeLessThan(500);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('refuses an unknown or lower-case code', () => {
    expect(errorCodeSchema.safeParse('TEAPOT').success).toBe(false);
    expect(errorCodeSchema.safeParse('not_found').success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  const body = { code: 'NOT_FOUND', message: 'Invoice not found', fields: [], requestId: 'req-1' };

  it('accepts the documented shape', () => {
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  it('accepts an empty field path, which means the whole body', () => {
    expect(
      fieldErrorSchema.safeParse({ path: '', code: 'invalid_type', message: 'Expected object' }).success,
    ).toBe(true);
  });

  it('refuses a body missing any of code, message, fields or requestId', () => {
    for (const key of ['code', 'message', 'fields', 'requestId'] as const) {
      const partial = Object.fromEntries(Object.entries(body).filter(([k]) => k !== key));
      expect(apiErrorSchema.safeParse(partial).success, key).toBe(false);
    }
  });

  it('refuses a field error without a path', () => {
    expect(apiErrorSchema.safeParse({ ...body, fields: [{ code: 'x', message: 'y' }] }).success).toBe(false);
  });

  it('drops unknown keys, so a stack or internal detail never survives a parse', () => {
    const parsed = apiErrorSchema.parse({ ...body, stack: 'at secret.ts:1', cause: { sql: 'SELECT 1' } });
    expect(parsed).toEqual(body);
    expect(parsed).not.toHaveProperty('stack');
    expect(parsed).not.toHaveProperty('cause');
  });

  it('accepts the body built from any AppError (property)', () => {
    fc.assert(
      fc.property(
        codeArb,
        fc.string(),
        fc.array(fieldArb, { maxLength: 5 }),
        fc.uuid(),
        (code, message, fields, id) => {
          const err = new AppError(code, message, fields);
          const response = { code: err.code, message: err.message, fields: err.fields, requestId: id };
          return apiErrorSchema.safeParse(response).success;
        },
      ),
    );
  });
});
