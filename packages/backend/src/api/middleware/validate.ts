import { AppError, type FieldError } from '@erp/shared';
import type { z } from 'zod';

/**
 * Controllers parse untrusted input with a shared Zod schema. On failure this throws
 * VALIDATION_FAILED with one entry per bad field; errorMiddleware sends it.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError('VALIDATION_FAILED', 'The request has invalid fields.', zodIssuesToFields(result.error));
}

export function zodIssuesToFields(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
    message: issue.message,
  }));
}
