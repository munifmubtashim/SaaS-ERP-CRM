import type { z } from 'zod';
import type { serviceSchema } from '../schemas/service.schema.js';

/**
 * Service module, types. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Service = z.infer<typeof serviceSchema>;
