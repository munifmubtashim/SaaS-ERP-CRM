import type { z } from 'zod';
import type { accountingSchema } from '../schemas/accounting.schema.js';

/**
 * Accounting module, types. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Accounting = z.infer<typeof accountingSchema>;
