import type { z } from 'zod';
import type { inventorySchema, stockItemSchema, stockListSchema } from '../schemas/inventory.schema.js';

/**
 * Inventory module, types. Owner: Munif.
 * TODO(Munif): stock movements, transfers, counts (roadmap 4.3, 5.5).
 */
export type Inventory = z.infer<typeof inventorySchema>;
export type StockItem = z.infer<typeof stockItemSchema>;
/** GET /v1/stock. */
export type StockList = z.infer<typeof stockListSchema>;
