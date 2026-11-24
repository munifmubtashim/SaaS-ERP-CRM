import { BaseQuery } from './BaseQuery.js';

/**
 * Inventory module: database access (dal). Satisfies businessLogic contracts/IInventoryQuery. Owner: Munif. The stock
 * reads themselves are in StockQuery, the only TypeScript that names the stock cache (ADR 0021 test 12).
 */
export class InventoryQuery extends BaseQuery {
  /** The business's walk-in party (ADR 0019), for the POS catalog; null until one exists. Business-wide, under RLS. */
  async walkInPartyId(): Promise<string | null> {
    const [row] = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id::text FROM party WHERE is_walk_in LIMIT 1`;
    return row?.id ?? null;
  }
}
