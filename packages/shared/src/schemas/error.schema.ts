import { z } from 'zod';

/**
 * Stable machine codes for API errors (roadmap 4.4, appendix C).
 * A code never changes meaning once released; the human message is localised by the client.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export const fieldErrorSchema = z.object({
  /** Dotted path to the offending field, e.g. "lines.0.qty". Empty string for the whole body. */
  path: z.string(),
  /** Machine code for this field problem (a Zod issue code or a domain code). */
  code: z.string(),
  message: z.string(),
});

/** The one error shape every API error response uses: {code, message, fields[], requestId}. */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  fields: z.array(fieldErrorSchema),
  requestId: z.string(),
});
