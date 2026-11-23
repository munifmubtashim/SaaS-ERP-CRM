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

/**
 * One field error per Zod issue. A refine always reports `code: 'custom'`, so a shared schema puts its stable
 * machine code (e.g. `payment.amount_invalid`) in the issue's `params.code`; that code wins when it is a
 * non-empty string. Every other issue keeps Zod's own code (`too_small`, `invalid_type` ...).
 */
export function zodIssuesToFields(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: stableCode(issue) ?? issue.code,
    message: issue.message,
  }));
}

function stableCode(issue: z.ZodError['issues'][number]): string | undefined {
  if (issue.code !== 'custom') return undefined;
  const code: unknown = issue.params?.code;
  return typeof code === 'string' && code !== '' ? code : undefined;
}
