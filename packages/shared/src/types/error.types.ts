import type { z } from 'zod';
import type { apiErrorSchema, errorCodeSchema, fieldErrorSchema } from '../schemas/error.schema.js';

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
