import type { z } from 'zod';
import type { salesSchema } from '../schemas/sales.schema.js';

/**
 * Sales module, types. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Sales = z.infer<typeof salesSchema>;
