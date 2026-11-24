import { z } from 'zod';
import { moneySchema } from '../utils/money.js';
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

/** One product at the request's branch (GET /v1/stock/pos-catalog). No cost: the average cost is a hidden figure (plan 2.5). */
export const posCatalogItemSchema = z
  .object({
    productId: z.uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    unit: z.string().min(1),
    /** The product's category (Parts, Oil, Tyres …), for the POS filter; null when none is set. */
    category: z.string().min(1).nullable(),
    tracking: z.enum(['serial', 'quantity']),
    sellPrice: moneySchema,
    /** A pass-through fee (item 3d): sold without stock. */
    isPassThrough: z.boolean(),
    /** numeric(18,3) as a string, never a number. */
    onHand: z.string().regex(/^-?\d{1,15}\.\d{3}$/, 'A quantity with 3 decimals'),
    /** Serial units in stock at the branch, for the POS to choose from; empty for counted products. */
    units: z.array(z.object({ id: z.uuid(), serialNo: z.string().min(1) }).strict()),
  })
  .strict();

/**
 * GET /v1/stock/pos-catalog (Munif, 24 Nov): what the counter can sell. Every active product of the business with
 * its stock at the request's branch and the serial units in stock, and the business's walk-in party (null until one
 * exists). The inventory page reads GET /v1/stock (#34's stockRowSchema) instead.
 */
export const posCatalogSchema = z
  .object({
    walkInPartyId: z.uuid().nullable(),
    items: z.array(posCatalogItemSchema),
  })
  .strict();
