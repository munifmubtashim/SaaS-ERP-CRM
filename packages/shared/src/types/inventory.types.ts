import type { z } from 'zod';
import type { inventorySchema, posCatalogItemSchema, posCatalogSchema } from '../schemas/inventory.schema.js';

/**
 * Inventory module, types. Owner: Munif.
 * TODO(Munif): stock movements, transfers, counts (roadmap 4.3, 5.5).
 */
export type Inventory = z.infer<typeof inventorySchema>;
export type PosCatalogItem = z.infer<typeof posCatalogItemSchema>;
/** GET /v1/stock/pos-catalog. */
export type PosCatalog = z.infer<typeof posCatalogSchema>;
