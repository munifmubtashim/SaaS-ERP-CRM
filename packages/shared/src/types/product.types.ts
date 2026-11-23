import type { z } from 'zod';
import type { productSchema, productModelSummarySchema } from '../schemas/product.schema.js';

/** Product types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type Product = z.infer<typeof productSchema>;
export type ProductModelSummary = z.infer<typeof productModelSummarySchema>;
