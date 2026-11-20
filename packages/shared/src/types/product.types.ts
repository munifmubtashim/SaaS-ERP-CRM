import type { z } from 'zod';
import type {
  productListItemSchema,
  productListQuerySchema,
  productListResponseSchema,
  productStatusSchema,
  productTrackingSchema,
} from '../schemas/product.schema.js';

/** Product module, types inferred from the Zod schemas. Owner: Munif. */
export type ProductTracking = z.infer<typeof productTrackingSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ProductListItem = z.infer<typeof productListItemSchema>;
/** What the caller may send (limit optional, as text or number). */
export type ProductListQueryInput = z.input<typeof productListQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductListResponse = z.infer<typeof productListResponseSchema>;
