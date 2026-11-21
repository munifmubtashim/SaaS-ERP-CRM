import type { DbClient } from '../../config/db.js';

/**
 * Test fixtures for the organization tree (ADR 0009, "Test fixtures"). `erp_app` has no INSERT on these tables,
 * so fixtures are inserted as the migration owner. RLS stays forced on the owner: its own policies are
 * `TO CURRENT_USER` and check the same `app.*` values as `erp_app`'s. So the helper takes every id first, sets
 * the `app.*` values in the same transaction, and inserts inside that scope. Nothing is deleted afterwards:
 * every call uses fresh ids, and tests assert only on their own rows.
 */
export interface Tree {
  organizationId: string;
  legalEntityId: string;
  businessId: string;
  branchId: string;
  businessName: string;
  shortCode: string;
}

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

export async function newIds(tx: Pick<DbClient, '$queryRaw'>, count: number): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT public.uuid_v7()::text AS id FROM generate_series(1, ${count}::int)`;
  return rows.map((row) => row.id);
}

/** set_config(…, true) is SET LOCAL with bound values, as runInTenantScope does (ADR 0005). */
export async function setScope(
  tx: Pick<Tx, '$queryRaw'>,
  organizationId: string,
  businessIds: string[],
  branchIds: string[],
): Promise<void> {
  await tx.$queryRaw`
    SELECT set_config('app.organization_id', ${organizationId}, true),
           set_config('app.business_ids', ${businessIds.join(',')}, true),
           set_config('app.branch_ids', ${branchIds.join(',')}, true)`;
}

/** One organization, one legal entity, one business and one branch, all with fresh ids. */
export async function createTree(
  owner: DbClient,
  options: { businessName?: string; shortCode?: string } = {},
): Promise<Tree> {
  return owner.$transaction(async (tx) => {
    const [organizationId, legalEntityId, businessId, branchId] = (await newIds(tx, 4)) as [
      string,
      string,
      string,
      string,
    ];
    const suffix = businessId.slice(-8);
    const businessName = options.businessName ?? `Test Business ${suffix}`;
    const shortCode = options.shortCode ?? 'UTT';
    await setScope(tx, organizationId, [businessId], [branchId]);
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${organizationId}::uuid, ${`Test Org ${suffix}`})`;
    await tx.$executeRaw`
      INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${legalEntityId}::uuid, ${organizationId}::uuid, ${`Test Legal ${suffix}`})`;
    await tx.$executeRaw`
      INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${businessId}::uuid, ${organizationId}::uuid, ${legalEntityId}::uuid, ${businessName})`;
    await tx.$executeRaw`
      INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${branchId}::uuid, ${businessId}::uuid, ${`Test Branch ${suffix}`}, ${shortCode})`;
    return { organizationId, legalEntityId, businessId, branchId, businessName, shortCode };
  });
}

/** Another business in an existing organization and legal entity. Throws what the database throws. */
export async function addBusiness(
  owner: DbClient,
  tree: Tree,
  name: string,
  isActive = true,
): Promise<string> {
  return owner.$transaction(async (tx) => {
    const [businessId] = (await newIds(tx, 1)) as [string];
    await setScope(tx, tree.organizationId, [businessId], []);
    await tx.$executeRaw`
      INSERT INTO business (id, organization_id, legal_entity_id, name, is_active)
      VALUES (${businessId}::uuid, ${tree.organizationId}::uuid, ${tree.legalEntityId}::uuid, ${name}, ${isActive})`;
    return businessId;
  });
}

/** Another branch under an existing business. Throws what the database throws. */
export async function addBranch(
  owner: DbClient,
  organizationId: string,
  businessId: string,
  shortCode: string,
): Promise<string> {
  return owner.$transaction(async (tx) => {
    const [branchId] = (await newIds(tx, 1)) as [string];
    await setScope(tx, organizationId, [businessId], [branchId]);
    await tx.$executeRaw`
      INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${branchId}::uuid, ${businessId}::uuid, ${`Test Branch ${shortCode}`}, ${shortCode})`;
    return branchId;
  });
}
