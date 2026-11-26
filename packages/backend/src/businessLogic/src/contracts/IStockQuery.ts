/**
 * What StockService needs from the stock ledger's dal (ADR 0021 sections 2 and 3, ADR 0054). Owned here; dal's
 * StockQuery satisfies it. Quantities and money are strings; every call runs in the caller's tenant transaction.
 */
export interface StockMovementRecord {
  branchId: string;
  productId: string;
  serialUnitId: string | null;
  qtyDelta: string;
  unitCost: string;
  kind: 'opening' | 'receipt' | 'sale' | 'adjustment';
  reason: string | null;
  sourceType: string;
  sourceId: string;
  /** The movement's business date (YYYY-MM-DD, Asia/Dhaka), from the service's clock. */
  movementDate?: string;
}

export interface IStockQuery {
  defaultLocation(branchId: string): Promise<string>;
  lockForIn(
    branchId: string,
    productId: string,
  ): Promise<{ locationId: string; onHand: string; avgCost: string }>;
  addIn(branchId: string, productId: string, locationId: string, qty: string): Promise<string>;
  setCost(branchId: string, productId: string, avgCost: string): Promise<void>;
  costForOut(branchId: string, productId: string): Promise<string | null>;
  takeOut(branchId: string, productId: string, locationId: string, qty: string): Promise<string | null>;
  lockUnit(unitId: string, branchId: string): Promise<{ unitCost: string; inLedger: string } | null>;
  insertMovement(row: StockMovementRecord): Promise<string>;
}
