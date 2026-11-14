import type { ErrorCode, FieldError } from '../types/error.types.js';

/**
 * Throw from Managers (business rules) and Controllers. errorMiddleware turns it into the
 * shared error shape. Plain TypeScript so every layer can use it without depending on Express.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields: FieldError[];

  constructor(code: ErrorCode, message: string, fields: FieldError[] = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

/** HTTP status for each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};
