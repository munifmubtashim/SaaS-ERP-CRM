import type { z } from 'zod';
import type { purchaseSchema } from '../schemas/purchase.schema.js';

/**
 * Purchase module, types. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Purchase = z.infer<typeof purchaseSchema>;
