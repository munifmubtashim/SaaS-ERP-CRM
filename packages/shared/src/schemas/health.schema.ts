import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['ok', 'down']);

/** Response of GET /health. Used by uptime checks and by the frontend status panel. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  /** ISO 8601, UTC. */
  time: z.iso.datetime(),
  checks: z.object({
    database: dependencyStatusSchema,
  }),
});
