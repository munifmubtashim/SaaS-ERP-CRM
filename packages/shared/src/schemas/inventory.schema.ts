import { z } from 'zod';
import { moneySchema } from '../utils/money.js';

/**
 * Inventory module, Zod schemas shared by backend and frontend. Owner: Munif.
 * TODO(Munif): stock movements, transfers, counts (roadmap 4.3, 5.5).
 */
export const inventorySchema = z.object({});

/** A stock quantity: numeric(18,3) as a string, never a number. */
export const stockQuantitySchema = z.string().regex(/^-?\d{1,15}\.\d{3}$/, 'A quantity with 3 decimals');

/** One product at the request's branch (GET /v1/stock). No cost: the average cost is a hidden figure (plan 2.5). */
export const stockItemSchema = z
  .object({
    productId: z.uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    unit: z.string().min(1),
    tracking: z.enum(['serial', 'quantity']),
    sellPrice: moneySchema,
    /** A pass-through fee (item 3d): sold without stock. */
    isPassThrough: z.boolean(),
    onHand: stockQuantitySchema,
    /** Serial units in stock at the branch, for the POS to choose from; empty for counted products. */
    units: z.array(z.object({ id: z.uuid(), serialNo: z.string().min(1) }).strict()),
  })
  .strict();

/**
 * GET /v1/stock (Munif, 24 Nov): every active product of the business with its stock at the request's branch, and
 * the business's walk-in party (null until one exists), for the POS and the inventory page.
 */
export const stockListSchema = z
  .object({
    walkInPartyId: z.uuid().nullable(),
    items: z.array(stockItemSchema),
  })
  .strict();
