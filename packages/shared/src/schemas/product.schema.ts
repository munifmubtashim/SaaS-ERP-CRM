import { z } from 'zod';
import { moneySchema } from '../utils/money.js';

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
