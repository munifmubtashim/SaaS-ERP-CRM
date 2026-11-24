import { z } from 'zod';
import { moneySchema } from '../utils/money.js';

/**
 * Inventory module, Zod schemas shared by backend and frontend. Owner: Munif.
 *
 * PROVISIONAL VIEW SHAPES for the Inventory screen (design/owner-dashboard/Inventory.dc.html): what the screen shows,
 * not how stock is stored. Stock is per branch here and never per location: they don't decide the stock-by-location
 * question (ADR 0034) or how movements post (ADR 0021). Replace them when those plans are agreed.
 */

/** A quantity as a decimal string, up to 3 decimals (numeric(18,3)). #34's quantity helper replaces this. */
export const quantityTextSchema = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,3})?$/, 'A quantity is a decimal string');
/** A change in quantity: negative when stock goes out. */
export const signedQuantityTextSchema = z
  .string()
  .regex(/^-?\d{1,15}(\.\d{1,3})?$/, 'A quantity change is a signed decimal string');
const positiveQuantity = quantityTextSchema.refine((value) => Number.parseFloat(value) > 0, 'More than zero');

/** Derived from on-hand and the reorder level: in stock, low (at or below reorder), out (nothing left). */
export const stockStatusSchema = z.enum(['in_stock', 'low', 'out']);

/** One row of the stock list, for the chosen branch or all branches. */
export const stockItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().min(1),
  onHand: quantityTextSchema,
  reserved: quantityTextSchema,
  reorderLevel: quantityTextSchema,
  status: stockStatusSchema,
  /** Value at cost: a hidden field, present only for callers allowed to see cost (plan 2.5). */
  valueAtCost: moneySchema.optional(),
});

export const stockItemDetailSchema = stockItemSchema.extend({
  byBranch: z.array(
    z.object({ branchId: z.string().min(1), branchName: z.string().min(1), onHand: quantityTextSchema }),
  ),
  /** Unit cost: hidden like valueAtCost. */
  unitCost: moneySchema.optional(),
});

export const movementTypeSchema = z.enum(['sale', 'purchase', 'adjustment', 'transfer_in', 'transfer_out']);

export const stockMovementSchema = z.object({
  id: z.string().min(1),
  at: z.iso.datetime(),
  itemName: z.string().min(1),
  branchName: z.string().min(1),
  type: movementTypeSchema,
  quantityDelta: signedQuantityTextSchema,
  /** The source document: an invoice, purchase, adjustment or transfer number. */
  reference: z.string().min(1),
  by: z.string().min(1),
});

export const transferStatusSchema = z.enum(['in_transit', 'received']);

export const transferSchema = z.object({
  number: z.string().min(1),
  createdAt: z.iso.datetime(),
  itemName: z.string().min(1),
  quantity: positiveQuantity,
  fromBranch: z.string().min(1),
  toBranch: z.string().min(1),
  status: transferStatusSchema,
});

/** The Adjust stock form. A reason is always required. */
export const stockAdjustmentDraftSchema = z.object({
  itemId: z.string().min(1),
  branchId: z.string().min(1),
  direction: z.enum(['add', 'remove']),
  quantity: positiveQuantity,
  reason: z.string().trim().min(1).max(200),
});

/** The Transfer to a branch form. */
export const transferDraftSchema = z
  .object({
    itemId: z.string().min(1),
    fromBranchId: z.string().min(1),
    toBranchId: z.string().min(1),
    quantity: positiveQuantity,
  })
  .refine((draft) => draft.fromBranchId !== draft.toBranchId, {
    path: ['toBranchId'],
    message: 'Choose another branch',
  });

/**
 * Inventory module, Zod schemas shared by backend and frontend. Owner: Munif.
 * TODO(Munif): stock movements, transfers, counts (roadmap 4.3, 5.5).
 */
export const inventorySchema = z.object({});

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
