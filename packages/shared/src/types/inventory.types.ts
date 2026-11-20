import type { z } from 'zod';
import type {
  stockListQuerySchema,
  stockListResponseSchema,
  stockRowSchema,
} from '../schemas/inventory.schema.js';

/** Inventory module, types inferred from the Zod schemas. Owner: Munif. */
export type StockRow = z.infer<typeof stockRowSchema>;
/** What the caller may send (limit optional, as text or number). */
export type StockListQueryInput = z.input<typeof stockListQuerySchema>;
export type StockListQuery = z.infer<typeof stockListQuerySchema>;
export type StockListResponse = z.infer<typeof stockListResponseSchema>;
