import type { z } from 'zod';
import type {
  productSchema,
  productModelSummarySchema,
  productCreateSchema,
  productDetailSchema,
  productEditSchema,
  productListItemSchema,
  productListQuerySchema,
  productListResponseSchema,
  productStatusSchema,
  productTrackingSchema,
} from '../schemas/product.schema.js';

/** Product types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type Product = z.infer<typeof productSchema>;
export type ProductModelSummary = z.infer<typeof productModelSummarySchema>;

/** Product module, types inferred from the Zod schemas. Owner: Munif. */
export type ProductTracking = z.infer<typeof productTrackingSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ProductListItem = z.infer<typeof productListItemSchema>;
/** What the caller may send (limit optional, as text or number). */
export type ProductListQueryInput = z.input<typeof productListQuerySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductListResponse = z.infer<typeof productListResponseSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductEdit = z.infer<typeof productEditSchema>;
