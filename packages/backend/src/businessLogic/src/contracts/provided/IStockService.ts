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
   * Records the movements, applied sorted by (productId, branchId) so two documents can't deadlock. Any movement
   * that would take on-hand below zero refuses the whole call with 409 stock.insufficient and writes nothing
   * (spec F-08; atomic conditional UPDATE in the real service, invariant 6).
   */
  move(movements: StockMovementDraft[]): Promise<{ movementIds: string[] }>;
}
