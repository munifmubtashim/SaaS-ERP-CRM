import type { z } from 'zod';
import type {
  movementTypeSchema,
  stockAdjustmentDraftSchema,
  stockItemDetailSchema,
  stockItemSchema,
  stockListQuerySchema,
  stockListResponseSchema,
  stockMovementSchema,
  stockRowSchema,
  stockStatusSchema,
  transferDraftSchema,
  transferSchema,
  transferStatusSchema,
} from '../schemas/inventory.schema.js';

/** Inventory module, types inferred from the Zod schemas. Owner: Munif. */
export type StockRow = z.infer<typeof stockRowSchema>;
/** What the caller may send (limit optional, as text or number). */
export type StockListQueryInput = z.input<typeof stockListQuerySchema>;
export type StockListQuery = z.infer<typeof stockListQuerySchema>;
export type StockListResponse = z.infer<typeof stockListResponseSchema>;

/** Provisional view shapes for the inventory screens (see the schema file). */
export type StockStatus = z.infer<typeof stockStatusSchema>;
export type StockItem = z.infer<typeof stockItemSchema>;
export type StockItemDetail = z.infer<typeof stockItemDetailSchema>;
export type MovementType = z.infer<typeof movementTypeSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type TransferStatus = z.infer<typeof transferStatusSchema>;
export type Transfer = z.infer<typeof transferSchema>;
export type StockAdjustmentDraft = z.infer<typeof stockAdjustmentDraftSchema>;
export type TransferDraft = z.infer<typeof transferDraftSchema>;
