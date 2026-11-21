import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';
import {
  DAL_DIR,
  functionsIn,
  latestMigrationFunctions,
  migrationFolders,
  migrationSql,
} from './sqlFunctions.js';
import { addBranch, addBusiness, createTree, newIds, type Tree } from './support/orgTree.js';

/**
 * ADR 0009 part 2 (A3b): erp_provisioner's grants and its own policies on business and branch, and
 * branch_is_active(). ADR 0008 tests 12 and 13 (database half) and 17, and ADR 0009 case 8.
 *
 * The provisioner is reached with SET LOCAL ROLE from the owner's connection (a superuser in dev and CI), so
 * current_user is erp_provisioner and only its policies apply. Its own connection URL comes with A3c (ADR 0010).
 * Like ProvisioningQuery, each transaction sets app.organization_id only, never app.business_ids.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

/** The name the migration grants to. #28's init script creates it from PROVISIONER_DB_USER (the same default). */
const PROVISIONER = 'erp_provisioner';

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

/** One provisioner transaction for one organization, as ProvisioningQuery will run it (ADR 0010). */
const asProvisioner = <T>(organizationId: string, fn: (tx: Tx) => Promise<T>) =>
  owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROVISIONER}`);
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return fn(tx);
  });

let x: Tree;
let y: Tree;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the sources match the organization_provisioning migration', () => {
  it('dal/sql/rls/organization_provisioning.sql appears, unchanged, in the migration', () => {
    const normalise = (sql: string) =>
      sql
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const source = normalise(readFileSync(`${DAL_DIR}sql/rls/organization_provisioning.sql`, 'utf8'));
    const folder = migrationFolders().find((name) => name.endsWith('_organization_provisioning'));
    expect(folder, 'an organization_provisioning migration exists').toBeDefined();
    expect(normalise(migrationSql(folder as string))).toContain(source);
  });

  it('dal/sql/functions/branch_is_active.sql defines exactly branch_is_active, as the latest migration does', () => {
    const source = functionsIn(readFileSync(`${DAL_DIR}sql/functions/branch_is_active.sql`, 'utf8'));
    expect([...source.keys()]).toEqual(['branch_is_active']);
    expect(latestMigrationFunctions().get('branch_is_active')).toBe(source.get('branch_is_active'));
  });
});

describe('ADR 0008 tests 12 and 13, database half: erp_provisioner creates, in its own organization only', () => {
  it('creates a business and a branch with only app.organization_id set, and gets the rows back', async () => {
    const created = await asProvisioner(x.organizationId, async (tx) => {
      const [callerId] = (await newIds(tx, 1)) as [string];
      const [business] = await tx.$queryRaw<{ id: string; created_by: string }[]>`
        INSERT INTO business (organization_id, legal_entity_id, name, created_by)
        VALUES (${x.organizationId}::uuid, ${x.legalEntityId}::uuid, ${`Provisioned ${callerId.slice(-8)}`},
                ${callerId}::uuid)
        RETURNING id::text, created_by::text`;
      const [branch] = await tx.$queryRaw<{ short_code: string }[]>`
        INSERT INTO branch (business_id, name, short_code, created_by)
        VALUES (${business?.id}::uuid, 'Provisioned Branch', 'PRV', ${callerId}::uuid)
        RETURNING short_code`;
      return { business, branch, callerId };
    });
    expect(created.business?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.business?.created_by).toBe(created.callerId);
    expect(created.branch).toEqual({ short_code: 'PRV' });
  });

  it("its transaction never has app.business_ids, so erp_app's and the owner's policies can't be what passed", async () => {
    await expect(
      asProvisioner(x.organizationId, (tx) => tx.$queryRaw`SELECT app_business_ids()`),
    ).rejects.toThrow(/tenant scope not set/);
  });

  it('cannot create a business in another organization (ADR 0008 test 17, #27)', async () => {
    const insert = asProvisioner(
      x.organizationId,
      (tx) => tx.$executeRaw`
      INSERT INTO business (organization_id, legal_entity_id, name)
      VALUES (${y.organizationId}::uuid, ${y.legalEntityId}::uuid, 'Planted In Y')`,
    );
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it("cannot see another organization's businesses or branches, only its own", async () => {
    const seen = await asProvisioner(
      x.organizationId,
      (tx) => tx.$queryRaw<{ own: number; other: number }[]>`
      SELECT (SELECT count(*) FROM business WHERE id IN (${x.businessId}::uuid, ${y.businessId}::uuid)
                AND organization_id = ${x.organizationId}::uuid)::int
           + (SELECT count(*) FROM branch WHERE id = ${x.branchId}::uuid)::int AS own,
             (SELECT count(*) FROM business WHERE id = ${y.businessId}::uuid)::int
           + (SELECT count(*) FROM branch WHERE id = ${y.branchId}::uuid)::int AS other`,
    );
    expect(seen).toEqual([{ own: 2, other: 0 }]);
  });

  it("cannot create a branch under another organization's business", async () => {
    const insert = asProvisioner(
      x.organizationId,
      (tx) => tx.$executeRaw`
      INSERT INTO branch (business_id, name, short_code) VALUES (${y.businessId}::uuid, 'Planted', 'PLT')`,
    );
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it('ADR 0009 case 8: cannot create a branch under a deactivated business of its own organization', async () => {
    const closed = await addBusiness(owner, x, `Closed ${x.businessId.slice(-8)}`, false);
    const insert = asProvisioner(
      x.organizationId,
      (tx) => tx.$executeRaw`
      INSERT INTO branch (business_id, name, short_code) VALUES (${closed}::uuid, 'Too Late', 'LATE')`,
    );
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it.each([
    `UPDATE business SET name = 'x'`,
    `DELETE FROM business`,
    `UPDATE branch SET name = 'x'`,
    `DELETE FROM branch`,
    `SELECT id FROM organization`,
    `SELECT id FROM legal_entity`,
    `TRUNCATE business`,
  ])('ADR 0008 test 17: is denied "%s"', async (statement) => {
    await expect(asProvisioner(x.organizationId, (tx) => tx.$executeRawUnsafe(statement))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('branch_is_active(branch_id), under the caller’s RLS', () => {
  it('is true for an active branch, false for a deactivated one, NULL outside the scope', async () => {
    // A letter, then four uppercase hex characters: a valid short code that no other test in this file uses.
    const closedBranch = await addBranch(
      owner,
      x.organizationId,
      x.businessId,
      `C${x.branchId.slice(-4).toUpperCase()}`,
    );
    // The dev and CI owner is a superuser, so it can deactivate without setting a scope.
    await owner.$executeRaw`UPDATE branch SET is_active = false WHERE id = ${closedBranch}::uuid`;
    const scope = {
      organizationId: x.organizationId,
      businessIds: [x.businessId],
      branchIds: [x.branchId, closedBranch],
    };
    const rows = await runInTenantScope(
      app,
      scope,
      () =>
        currentClient().$queryRaw<
          { active: boolean | null; closed: boolean | null; outside: boolean | null }[]
        >`
        SELECT branch_is_active(${x.branchId}::uuid) AS active, branch_is_active(${closedBranch}::uuid) AS closed,
               branch_is_active(${y.branchId}::uuid) AS outside`,
    );
    expect(rows).toEqual([{ active: true, closed: false, outside: null }]);
  });

  it('is STABLE, not SECURITY DEFINER, with a fixed search_path', async () => {
    const rows = await owner.$queryRaw<{ volatile: string; definer: boolean; config: string[] | null }[]>`
      SELECT provolatile::text AS volatile, prosecdef AS definer, proconfig::text[] AS config
        FROM pg_proc WHERE proname = 'branch_is_active' AND pronamespace = 'public'::regnamespace`;
    expect(rows).toEqual([{ volatile: 's', definer: false, config: ['search_path=pg_catalog, public'] }]);
  });
});
