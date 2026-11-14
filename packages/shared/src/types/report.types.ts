import type { z } from 'zod';
import type { reportSchema } from '../schemas/report.schema.js';

/**
 * Report module, types. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Report = z.infer<typeof reportSchema>;
