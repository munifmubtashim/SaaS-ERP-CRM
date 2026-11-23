import type { MoneyString } from './IPostingService.js';

/**
 * Published by Inventory for every module that moves stock (ADR 0012 section 3). Runs in the caller's ambient
 * transaction (ADR 0005). Movements are append-only (invariant 2); a correction is a new opposite movement.
 */

/** A three-decimal quantity string ("1.000"); negative means out. Never a float. */
export type QuantityString = string;

export interface StockMovementDraft {
  productId: string;
  branchId: string;
  qtyDelta: QuantityString;
  /** Serial-tracked units (invariant 7). */
  unitId?: string;
  /** Required on receipts; a hidden field (plan 2.5). */
  unitCost?: MoneyString;
  source: { type: string; id: string };
}

export interface IStockService {
  /**
   * Records the movements, applied sorted by (productId, branchId). **The returned `movementIds[i]` is the id of
   * `movements[i]`**, in the order given, whatever order they were applied in.
   * Refusals write nothing, for the whole call:
   * - a movement that would take on-hand below zero: 409 stock.insufficient (spec F-08; an atomic conditional
   *   UPDATE in the real service, invariant 6);
   * - a receipt (positive quantity) without `unitCost`: 500 stock.unit_cost_required (a consumer bug);
   * - a serial unit with a quantity other than 1 or -1: 500 stock.serial_quantity;
   * - a serial unit received while in stock: 409 unit.already_in_stock; sent out while not in stock:
   *   409 unit.not_available (ADR 0020).
   */
  move(movements: StockMovementDraft[]): Promise<{ movementIds: string[] }>;
}
