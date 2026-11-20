import { z } from 'zod';
import { cursorPageSchema, pageQuerySchema, searchTermSchema } from '../utils/pagination.js';

/**
 * Product module, Zod schemas shared by backend and frontend. Owner: Munif.
 * Read shapes for the product list (release 1, P-05, P-10), on a mock service until the catalogue tables are
 * planned. Core only: model year, engine cc and other vehicle details belong to the Vehicle pack (spec O-11).
 * No cost or margin here: those are hidden fields with their own rule (plan 2.5).
 */
export const productTrackingSchema = z.enum(['serial', 'quantity']);
export const productStatusSchema = z.enum(['active', 'archived']);

/** One row of the product list. Unknown keys are stripped, so a hidden field cannot ride along. */
export const productListItemSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  /** One brand per product in release 1 (P-10). */
  brand: z.string().min(1).max(100).nullable(),
  /** Unit of measure shown next to quantities, e.g. "pcs", "litre". */
  unit: z.string().min(1).max(16),
  /** Serial-tracked units carry their own cost and history (invariant 7); others are counted. */
  tracking: productTrackingSchema,
  status: productStatusSchema,
});

/** GET /v1/products query: search by name, code or brand; filter by status; cursor page. */
export const productListQuerySchema = pageQuerySchema.extend({
  search: searchTermSchema,
  status: productStatusSchema.optional(),
});

export const productListResponseSchema = cursorPageSchema(productListItemSchema);
