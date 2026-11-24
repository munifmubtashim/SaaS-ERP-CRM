import { AppError } from '@erp/shared';
import { BaseQuery } from './BaseQuery.js';

/** One stock movement to record (ADR 0021 section 1). Quantities and money as strings; never a float. */
export interface StockMovementInsert {
  branchId: string;
  productId: string;
  serialUnitId: string | null;
  /** Positive in, negative out; three-decimal string. */
  qtyDelta: string;
  /** The receipt cost in, the cost used out. A hidden field. */
  unitCost: string;
  kind: 'opening' | 'receipt' | 'sale' | 'adjustment';
  /** Why, for an adjustment (ADR 0054 decision 2). */
  reason: string | null;
  sourceType: string;
  sourceId: string;
  /** The business date, YYYY-MM-DD in Asia/Dhaka. */
  movementDate: string;
}

/**
 * The stock ledger's database access (ADR 0021 sections 1 to 3 as amended by ADR 0054). The only TypeScript that
 * names the stock cache (stock_balance, stock_cost): every change to it is one of the locked or atomic statements
 * below. Runs inside the request's tenant transaction and never opens one (invariant 4). StockService (businessLogic)
 * puts the steps together, sorted by (product, branch) so two documents can't deadlock.
 */
export class StockQuery extends BaseQuery {
  /** The branch's one location: its sales_floor, the default for sales (ADR 0054 section 1). */
  async defaultLocation(branchId: string): Promise<string> {
    const [row] = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM location WHERE branch_id = ${branchId}::uuid AND is_default_sale`;
    if (!row) throw new AppError('NOT_FOUND', 'No stock location for this branch in the current scope.');
    return row.id;
  }

  /**
   * Before stock comes in: the branch's cost row and the location's balance row exist (inserted at zero if missing),
   * then both are locked, cost first (ADR 0021 section 2). Returns the branch's on hand and average cost.
   */
  async lockForIn(
    branchId: string,
    productId: string,
  ): Promise<{ locationId: string; onHand: string; avgCost: string }> {
    await this.requireOneBusiness('Stock');
    const locationId = await this.defaultLocation(branchId);
    await this.db.$executeRaw`
      INSERT INTO stock_cost (business_id, branch_id, product_id)
      VALUES ((SELECT app_business_ids())[1], ${branchId}::uuid, ${productId}::uuid)
      ON CONFLICT (business_id, branch_id, product_id) DO NOTHING`;
    await this.db.$executeRaw`
      INSERT INTO stock_balance (business_id, branch_id, location_id, product_id)
      VALUES ((SELECT app_business_ids())[1], ${branchId}::uuid, ${locationId}::uuid, ${productId}::uuid)
      ON CONFLICT (business_id, branch_id, product_id, location_id) DO NOTHING`;
    const [cost] = await this.db.$queryRaw<{ avg_cost: string }[]>`
      SELECT avg_cost::text FROM stock_cost
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid FOR UPDATE`;
    const [balance] = await this.db.$queryRaw<{ on_hand: string }[]>`
      SELECT sum(on_hand)::numeric(18,3)::text AS on_hand FROM (
        SELECT on_hand FROM stock_balance
         WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid FOR UPDATE) locked`;
    if (!cost || !balance)
      throw new AppError('INTERNAL_ERROR', 'The stock rows were not found after insert.');
    return { locationId, onHand: balance.on_hand, avgCost: cost.avg_cost };
  }

  /** Stock in, under the locks lockForIn took: the location's on hand rises; the branch's average cost is set. */
  async applyIn(
    branchId: string,
    productId: string,
    locationId: string,
    qty: string,
    avgCost: string,
  ): Promise<void> {
    await this.db.$executeRaw`
      UPDATE stock_balance SET on_hand = on_hand + ${qty}::numeric, version = version + 1, updated_at = now()
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid AND location_id = ${locationId}::uuid`;
    await this.db.$executeRaw`
      UPDATE stock_cost SET avg_cost = ${avgCost}::numeric, version = version + 1, updated_at = now()
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid`;
  }

  /** The branch's average cost for stock going out, held FOR SHARE so a receipt can't change it mid-sale; null if none. */
  async costForOut(branchId: string, productId: string): Promise<string | null> {
    const [row] = await this.db.$queryRaw<{ avg_cost: string }[]>`
      SELECT avg_cost::text FROM stock_cost
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid FOR SHARE`;
    return row?.avg_cost ?? null;
  }

  /**
   * Stock out in one atomic conditional UPDATE (invariant 6): never read-then-write. Returns the new on hand, or null
   * when there isn't enough (the caller refuses with stock.insufficient and nothing is written, F-08).
   */
  async takeOut(
    branchId: string,
    productId: string,
    locationId: string,
    qty: string,
  ): Promise<string | null> {
    const [row] = await this.db.$queryRaw<{ on_hand: string }[]>`
      UPDATE stock_balance SET on_hand = on_hand - ${qty}::numeric, version = version + 1, updated_at = now()
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
         AND on_hand >= ${qty}::numeric
      RETURNING on_hand::text`;
    return row?.on_hand ?? null;
  }

  /** Records one movement at the branch's one location. Append-only: the table refuses any later change. */
  async insertMovement(row: StockMovementInsert): Promise<string> {
    await this.requireOneBusiness('A stock movement');
    const [inserted] = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO stock_movement (business_id, branch_id, location_id, product_id, serial_unit_id, qty_delta,
                                  unit_cost, kind, reason, source_type, source_id, movement_date)
      VALUES ((SELECT app_business_ids())[1], ${row.branchId}::uuid,
              (SELECT id FROM location WHERE branch_id = ${row.branchId}::uuid AND is_default_sale),
              ${row.productId}::uuid, ${row.serialUnitId}::uuid, ${row.qtyDelta}::numeric, ${row.unitCost}::numeric,
              ${row.kind}, ${row.reason}, ${row.sourceType}, ${row.sourceId}::uuid, ${row.movementDate}::date)
      RETURNING id::text`;
    if (!inserted) throw new AppError('INTERNAL_ERROR', 'The stock movement was not recorded.');
    return inserted.id;
  }

  /** On hand of a product at a branch: the cache, over the branch's locations. */
  async onHand(branchId: string, productId: string): Promise<string> {
    const [row] = await this.db.$queryRaw<{ on_hand: string }[]>`
      SELECT coalesce(sum(on_hand), 0)::numeric(18,3)::text AS on_hand FROM stock_balance
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid`;
    return row?.on_hand ?? '0.000';
  }

  /** The ledger's own total for a product at a branch: what onHand must always equal (invariant 3). */
  async movementSum(branchId: string, productId: string): Promise<string> {
    const [row] = await this.db.$queryRaw<{ total: string }[]>`
      SELECT coalesce(sum(qty_delta), 0)::numeric(18,3)::text AS total FROM stock_movement
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid`;
    return row?.total ?? '0.000';
  }
}
