import { z } from 'zod';
import { cursorPageSchema, pageQuerySchema, searchTermSchema } from '../utils/pagination.js';
import { quantitySchema } from '../utils/quantity.js';

/**
 * Inventory module, Zod schemas shared by backend and frontend. Owner: Munif.
 * Read shape for the stock-on-hand list (release 1, F-01), on a mock service until the stock tables are
 * planned. One row per product per branch. Bins (plan 3.1) and low-stock levels (plan 3.2) wait for their
 * design decisions; cost and stock value are hidden fields (plan 2.5) and are not in this row.
 */
export const stockRowSchema = z.object({
  productId: z.uuid(),
  productCode: z.string().min(1).max(32),
  productName: z.string().min(1).max(200),
  branchId: z.uuid(),
  branchName: z.string().min(1).max(200),
  /** Sum of the stock movements (invariant 3). Never negative (spec F-08). */
  onHand: quantitySchema.refine((q) => !q.startsWith('-'), 'On-hand stock is never negative'),
});

/** GET /v1/stock query: one branch or all the caller may see; search by product; cursor page. */
export const stockListQuerySchema = pageQuerySchema.extend({
  branchId: z.uuid().optional(),
  search: searchTermSchema,
});

export const stockListResponseSchema = cursorPageSchema(stockRowSchema);
