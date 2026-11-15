import type { z } from 'zod';
import type { crmSchema } from '../schemas/crm.schema.js';

/**
 * Crm module, types. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Crm = z.infer<typeof crmSchema>;
