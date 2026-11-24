import { AppError } from '@erp/shared';
import { Prisma } from '../generated/prisma/client.js';
import { BaseQuery } from './BaseQuery.js';

/** One stock movement to record (ADR 0021 section 1). Quantities and money as strings; never a float. */
/** A GET /v1/stock row (#34's stockRowSchema): one product at one branch. */
export interface StockRowRecord {
  productId: string;
  productCode: string;
  productName: string;
  branchId: string;
  branchName: string;
  onHand: string;
}

/** A GET /v1/stock/pos-catalog item: what the counter can sell at one branch. */
export interface PosCatalogItemRecord {
  productId: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  tracking: string;
  sellPrice: string;
  isPassThrough: boolean;
  onHand: string;
  units: { id: string; serialNo: string }[];
}

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
  /** The business date, YYYY-MM-DD; defaults to today in Asia/Dhaka by the database clock. */
  movementDate?: string;
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

  /**
   * Stock in, under the locks lockForIn took: the location's on hand rises. Returns the branch's new on hand, summed
   * exactly by the database (numeric), for the weighted average.
   */
  async addIn(branchId: string, productId: string, locationId: string, qty: string): Promise<string> {
    await this.db.$executeRaw`
      UPDATE stock_balance SET on_hand = on_hand + ${qty}::numeric, version = version + 1, updated_at = now()
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid AND location_id = ${locationId}::uuid`;
    return this.onHand(branchId, productId);
  }

  /** Sets the branch's average cost, under the lock lockForIn took on the cost row. */
  async setCost(branchId: string, productId: string, avgCost: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE stock_cost SET avg_cost = ${avgCost}::numeric, version = version + 1, updated_at = now()
       WHERE branch_id = ${branchId}::uuid AND product_id = ${productId}::uuid`;
  }

  /**
   * A serial unit at the branch, locked FOR UPDATE so two documents can't move it at once (F-02): its own cost
   * (invariant 7) and its ledger total there (1.000 = in stock). Null if no such unit at this branch in scope.
   */
  async lockUnit(unitId: string, branchId: string): Promise<{ unitCost: string; inLedger: string } | null> {
    const [unit] = await this.db.$queryRaw<{ unit_cost: string }[]>`
      SELECT unit_cost::text FROM serial_unit
       WHERE id = ${unitId}::uuid AND branch_id = ${branchId}::uuid FOR UPDATE`;
    if (!unit) return null;
    const [ledger] = await this.db.$queryRaw<{ total: string }[]>`
      SELECT coalesce(sum(qty_delta), 0)::numeric(18,3)::text AS total FROM stock_movement
       WHERE serial_unit_id = ${unitId}::uuid AND branch_id = ${branchId}::uuid`;
    return { unitCost: unit.unit_cost, inLedger: ledger?.total ?? '0.000' };
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
              ${row.kind}, ${row.reason}, ${row.sourceType}, ${row.sourceId}::uuid,
              coalesce(${row.movementDate ?? null}::date, (now() AT TIME ZONE 'Asia/Dhaka')::date))
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

  /**
   * GET /v1/stock's rows (#34): on hand per product per branch from the balance cache, under the caller's RLS (a branch
   * scope sees its branches only). Search on code or name (strpos: a % is a character); optional branch filter; a
   * (product, branch) cursor. No cost: the average cost is a hidden figure.
   */
  async stockRows(filter: {
    search?: string | undefined;
    branchId: string | null;
    after: { productId: string; branchId: string } | null;
    limit: number;
  }): Promise<StockRowRecord[]> {
    const where = [Prisma.sql`TRUE`];
    if (filter.search) {
      const term = filter.search.toLowerCase();
      where.push(Prisma.sql`(strpos(lower(p.name), ${term}) > 0 OR strpos(lower(p.code), ${term}) > 0)`);
    }
    if (filter.branchId) where.push(Prisma.sql`sb.branch_id = ${filter.branchId}::uuid`);
    if (filter.after) {
      where.push(
        Prisma.sql`(sb.product_id, sb.branch_id) > (${filter.after.productId}::uuid, ${filter.after.branchId}::uuid)`,
      );
    }
    return this.db.$queryRaw<StockRowRecord[]>`
      SELECT sb.product_id::text AS "productId", p.code AS "productCode", p.name AS "productName",
             sb.branch_id::text AS "branchId", br.name AS "branchName",
             sum(sb.on_hand)::numeric(18,3)::text AS "onHand"
        FROM stock_balance sb
        JOIN product p ON p.business_id = sb.business_id AND p.id = sb.product_id
        JOIN branch br ON br.business_id = sb.business_id AND br.id = sb.branch_id
       WHERE ${Prisma.join(where, ' AND ')}
       GROUP BY sb.product_id, p.code, p.name, sb.branch_id, br.name
       ORDER BY sb.product_id, sb.branch_id
       LIMIT ${filter.limit}`;
  }

  /**
   * GET /v1/stock/pos-catalog's items: every active product with its on hand at the branch (0.000 when none) and the
   * serial units in stock there (status in_stock and one unit in the ledger at this branch). No cost.
   */
  async posCatalogItems(branchId: string): Promise<PosCatalogItemRecord[]> {
    return this.db.$queryRaw<PosCatalogItemRecord[]>`
      SELECT p.id::text AS "productId", p.code, p.name, p.unit, p.category, p.tracking, p.sell_price::text AS "sellPrice",
             p.is_pass_through AS "isPassThrough",
             coalesce((SELECT sum(sb.on_hand) FROM stock_balance sb
                        WHERE sb.product_id = p.id AND sb.branch_id = ${branchId}::uuid), 0)::numeric(18,3)::text
               AS "onHand",
             coalesce((SELECT json_agg(json_build_object('id', u.id::text, 'serialNo', u.serial_no) ORDER BY u.serial_no)
                         FROM serial_unit u
                        WHERE u.product_id = p.id AND u.branch_id = ${branchId}::uuid AND u.status = 'in_stock'
                          AND (SELECT coalesce(sum(m.qty_delta), 0) FROM stock_movement m
                                WHERE m.serial_unit_id = u.id AND m.branch_id = ${branchId}::uuid) = 1),
                      '[]'::json) AS units
        FROM product p
       WHERE p.status = 'active'
       ORDER BY p.name, p.code`;
  }
}
