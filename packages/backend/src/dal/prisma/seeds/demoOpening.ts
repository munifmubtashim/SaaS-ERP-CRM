import type { DbClient } from '../../config/db.js';
import { demoId } from './demoBusiness.js';
import { inDemoBusiness } from './demoCatalogue.js';
import type { DemoIds } from './demoOrganization.js';

/**
 * The demo's opening journals (docs/demo-seed-spec.md section 4a, ADR 0058 S2). Stock movements post no journal, so
 * without these the books would show no inventory. One per branch that holds the demo's opening stock: Dr inventory,
 * Cr Opening balance equity, for the stock side (on hand × the branch's average cost over counted products, plus each
 * unit's own cost: the sum of the demo's opening movements, quantity × cost), numbered from the branch's journal
 * series and dated the opening day.
 *
 * Posted as the migration owner (PostingService posts by role only, and there is no equity role). The database still
 * checks it: balanced at commit (deferred trigger), permanent, numeric(18,2). A branch without opening stock gets none:
 * a journal line can't be zero. A second run writes nothing: the journal's id is fixed.
 */

/** The demo's opening movements carry this source type; a second run looks for them before moving anything. */
export const DEMO_OPENING_SOURCE = 'demo_opening';

/** True once the demo's opening stock is in (any movement with the demo's source type in the business). */
export async function demoOpeningStockDone(db: DbClient, ids: DemoIds): Promise<boolean> {
  const [row] = await inDemoBusiness(
    db,
    ids,
    (tx) =>
      tx.$queryRaw<{ done: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM stock_movement WHERE business_id = ${ids.businessId}::uuid
                                                  AND source_type = ${DEMO_OPENING_SOURCE}) AS done`,
  );
  return row?.done ?? false;
}

export async function seedDemoOpeningJournals(
  db: DbClient,
  ids: DemoIds,
  journalDate: string,
): Promise<void> {
  for (const branchId of ids.branchIds) {
    const journalId = demoId(ids.businessId, `opening-journal:${branchId}`);
    await inDemoBusiness(db, ids, async (tx) => {
      const [existing] = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM journal WHERE id = ${journalId}::uuid`;
      if ((existing?.n ?? 0) > 0) return;
      const [stock] = await tx.$queryRaw<{ value: string }[]>`
        SELECT coalesce(sum(qty_delta * unit_cost), 0)::numeric(18,2)::text AS value FROM stock_movement
         WHERE business_id = ${ids.businessId}::uuid AND branch_id = ${branchId}::uuid
           AND source_type = ${DEMO_OPENING_SOURCE}`;
      const value = stock?.value ?? '0.00';
      if (value === '0.00') return;
      const [taken] = await tx.$queryRaw<{ prefix: string; value: string; width: number }[]>`
        UPDATE number_series SET next_value = next_value + 1
         WHERE business_id = ${ids.businessId}::uuid AND branch_id = ${branchId}::uuid AND kind = 'journal'
        RETURNING prefix, (next_value - 1)::text AS value, width`;
      if (!taken) throw new Error('The demo branch has no journal series.');
      const number = `${taken.prefix}${taken.value.padStart(taken.width, '0')}`;
      const [inventory] = await tx.$queryRaw<{ id: string }[]>`
        SELECT account_id::text AS id FROM account_role
         WHERE business_id = ${ids.businessId}::uuid AND role = 'inventory'`;
      const [equity] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM account WHERE business_id = ${ids.businessId}::uuid AND name = 'Opening balance equity'`;
      if (!inventory || !equity)
        throw new Error('The demo chart has no inventory or Opening balance equity account.');
      await tx.$executeRaw`
        INSERT INTO journal (id, business_id, branch_id, number, journal_date, source_type, source_id, memo, posted_at)
        VALUES (${journalId}::uuid, ${ids.businessId}::uuid, ${branchId}::uuid, ${number}, ${journalDate}::date,
                'opening_stock', ${journalId}::uuid, 'Opening stock', now())`;
      await tx.$executeRaw`
        INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit)
        VALUES (${ids.businessId}::uuid, ${journalId}::uuid, 1, ${inventory.id}::uuid, ${value}::numeric, 0),
               (${ids.businessId}::uuid, ${journalId}::uuid, 2, ${equity.id}::uuid, 0, ${value}::numeric)`;
    });
  }
}
