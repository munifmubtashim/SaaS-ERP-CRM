import type { z } from 'zod';
import type { organizationSchema } from '../schemas/organization.schema.js';

/**
 * Organization module, types. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Organization = z.infer<typeof organizationSchema>;
