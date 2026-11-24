import { z } from 'zod';
import { moneySchema, MONEY_PATTERN } from '../utils/money.js';
import { cursorPageSchema, pageQuerySchema, searchTermSchema } from '../utils/pagination.js';

/**
 * Product module, Zod schemas shared by backend and frontend. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4); the catalogue schemas come with #34 and ADR 0052.
 */
export const productSchema = z.object({});

/**
 * PROVISIONAL VIEW SHAPE for the Models tab of the Products screen (design/owner-dashboard/Bikes.dc.html): a model
 * with its price and how many of its units are in each state. Counts, not stock rows: it decides nothing about stock.
 */
export const productModelSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  businessName: z.string().min(1),
  price: moneySchema,
  inStock: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  soldThisMonth: z.number().int().nonnegative(),
});

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

/** A selling price: a two-decimal money string, never negative (#105's CHECK). */
const sellPriceSchema = z
  .string()
  .regex(MONEY_PATTERN, 'Money must be a string with two decimals')
  .refine((value) => !value.startsWith('-'), 'A price cannot be negative');

/** GET /v1/products/:id, and the answer to create and edit (ADR 0052 section 2). No cost (ADR 0020 section 3). */
export const productDetailSchema = productListItemSchema.extend({
  nameBn: z.string().min(1).max(200).nullable(),
  category: z.string().min(1).max(100).nullable(),
  sellPrice: sellPriceSchema,
  /** The version the client read; an edit sends it back (optimistic check). */
  version: z.number().int().positive(),
});

/** POST /v1/products. Strict: a businessId or any other unknown key is a 400, not silently dropped. */
export const productCreateSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(200),
    nameBn: z.string().trim().min(1).max(200).nullable().default(null),
    brand: z.string().trim().min(1).max(100).nullable().default(null),
    category: z.string().trim().min(1).max(100).nullable().default(null),
    unit: z.string().trim().min(1).max(16),
    tracking: productTrackingSchema,
    sellPrice: sellPriceSchema,
  })
  .strict();

/** PATCH /v1/products/:id: the version read, and at least one change. code and tracking never change (#105). */
export const productEditSchema = z
  .object({
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    nameBn: z.string().trim().min(1).max(200).nullable().optional(),
    brand: z.string().trim().min(1).max(100).nullable().optional(),
    category: z.string().trim().min(1).max(100).nullable().optional(),
    unit: z.string().trim().min(1).max(16).optional(),
    sellPrice: sellPriceSchema.optional(),
    status: productStatusSchema.optional(),
  })
  .strict()
  .refine((edit) => Object.keys(edit).some((key) => key !== 'version'), {
    message: 'Change at least one field.',
    path: ['version'],
  });
