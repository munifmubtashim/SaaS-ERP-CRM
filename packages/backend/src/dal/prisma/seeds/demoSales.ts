import type { DbClient } from '../../config/db.js';
import { inDemoBusiness } from './demoCatalogue.js';
import type { DemoIds } from './demoOrganization.js';

/**
 * The reads the demo's Manager-driven steps 6 and 7 need to run once (ADR 0058 section 4): which demo customers exist
 * already (by phone), and whether the demo business has any invoice yet. The customers, sales and payments themselves
 * go through PartyManager and SalesManager in businessLogic, never through here.
 */
export async function demoCustomerIdsByPhone(
  db: DbClient,
  ids: DemoIds,
  phones: readonly string[],
): Promise<Map<string, string>> {
  const rows = await inDemoBusiness(
    db,
    ids,
    (tx) =>
      tx.$queryRaw<{ phone: string; id: string }[]>`
      SELECT phone_e164 AS phone, id::text FROM party
       WHERE business_id = ${ids.businessId}::uuid AND NOT is_walk_in AND phone_e164 = ANY (${[...phones]}::text[])`,
  );
  return new Map(rows.map((row) => [row.phone, row.id]));
}

export async function demoWalkInId(db: DbClient, ids: DemoIds): Promise<string> {
  const [row] = await inDemoBusiness(
    db,
    ids,
    (tx) =>
      tx.$queryRaw<
        { id: string }[]
      >`SELECT id::text FROM party WHERE business_id = ${ids.businessId}::uuid AND is_walk_in`,
  );
  if (!row) throw new Error('The demo business has no walk-in party (ADR 0055 trigger).');
  return row.id;
}

export async function demoSalesDone(db: DbClient, ids: DemoIds): Promise<boolean> {
  const [row] = await inDemoBusiness(
    db,
    ids,
    (tx) =>
      tx.$queryRaw<{ done: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM invoice WHERE business_id = ${ids.businessId}::uuid) AS done`,
  );
  return row?.done ?? false;
}
