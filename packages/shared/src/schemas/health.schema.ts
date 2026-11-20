import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['ok', 'down']);

/**
 * Response of GET /health/live: the process is up and answering. Checks no dependency, so a host's frequent
 * health checks never wake the database (Neon scales to zero only when left idle).
 */
export const livenessResponseSchema = z.object({ status: z.literal('ok') });

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
