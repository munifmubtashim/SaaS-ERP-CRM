import type { z } from 'zod';
import type {
  stockStatusSchema,
  stockItemSchema,
  stockItemDetailSchema,
  movementTypeSchema,
  stockMovementSchema,
  transferStatusSchema,
  transferSchema,
  stockAdjustmentDraftSchema,
  transferDraftSchema,
  inventorySchema,
  posCatalogItemSchema,
  posCatalogSchema,
} from '../schemas/inventory.schema.js';

/** Inventory types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type StockStatus = z.infer<typeof stockStatusSchema>;
export type StockItem = z.infer<typeof stockItemSchema>;
export type StockItemDetail = z.infer<typeof stockItemDetailSchema>;
export type MovementType = z.infer<typeof movementTypeSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type TransferStatus = z.infer<typeof transferStatusSchema>;
export type Transfer = z.infer<typeof transferSchema>;
export type StockAdjustmentDraft = z.infer<typeof stockAdjustmentDraftSchema>;
export type TransferDraft = z.infer<typeof transferDraftSchema>;

/**
 * Inventory module, types. Owner: Munif.
 * TODO(Munif): stock movements, transfers, counts (roadmap 4.3, 5.5).
 */
export type Inventory = z.infer<typeof inventorySchema>;
export type PosCatalogItem = z.infer<typeof posCatalogItemSchema>;
/** GET /v1/stock/pos-catalog. */
export type PosCatalog = z.infer<typeof posCatalogSchema>;
