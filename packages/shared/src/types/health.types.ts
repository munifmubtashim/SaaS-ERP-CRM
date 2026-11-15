import type { z } from 'zod';
import type { dependencyStatusSchema, healthResponseSchema } from '../schemas/health.schema.js';

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
