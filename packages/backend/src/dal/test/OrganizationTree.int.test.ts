import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';
import { DAL_DIR, migrationFolders, migrationSql } from './sqlFunctions.js';
import { addBranch, addBusiness, createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * ADR 0009 part 1 (A3b): the organization tree, its RLS, grants and triggers. Written from ADR 0008 tests 1 to 5
 * and ADR 0009's added test cases 1 to 5, 7 and 10. Cases 6 and 9 (the owner that is neither superuser nor
 * BYPASSRLS) are in OrganizationTreeOwner.int.test.ts. Reads run as erp_app; fixtures are inserted as the
 * migration owner through the shared helper, which always sets the app.* values first.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 10_000 });
/** One connection only, so "the same pooled connection" is guaranteed, not hoped for. */
const singleConnection: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });

const TABLES = ['organization', 'legal_entity', 'business', 'branch'] as const;

let x: Tree;
let y: Tree;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), singleConnection.$disconnect()]);
});

const scopeOf = (tree: Tree) => ({
  organizationId: tree.organizationId,
  businessIds: [tree.businessId],
  branchIds: [tree.branchId],
});

/** Runs fn as erp_app inside the tenant scope of `tree`, as a request would. */
const asApp = <T>(tree: Tree, fn: () => Promise<T>) => runInTenantScope(app, scopeOf(tree), fn);

describe('ADR 0008 tests 1 to 5 for the tree tables', () => {
  it('1. a user of business X cannot select, update or guess the id of business Y or its branch', async () => {
    await asApp(x, async () => {
      const db = currentClient();
      const branches = await db.$queryRaw<
        { id: string }[]
      >`SELECT id::text FROM branch WHERE id = ${y.branchId}::uuid`;
      expect(branches).toEqual([]);
      const businesses = await db.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM business WHERE id = ${y.businessId}::uuid`;
      expect(businesses).toEqual([]);
      const updated = await db.$executeRaw`UPDATE branch SET name = 'Taken' WHERE id = ${y.branchId}::uuid`;
      expect(updated).toBe(0);
    });
  });

  it("2. a user of organization X sees nothing of organization Y's tree", async () => {
    await asApp(x, async () => {
      const db = currentClient();
      for (const table of TABLES) {
        const rows = await db.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM ${table} WHERE ${table === 'organization' ? 'id' : table === 'branch' ? 'business_id' : 'organization_id'} = $1::uuid`,
          table === 'branch' ? y.businessId : y.organizationId,
        );
        expect(rows[0]?.n, table).toBe(0);
      }
    });
  });

  it('3. a pooled connection fails with "tenant scope not set" until the scope is set again', async () => {
    await runInTenantScope(
      singleConnection,
      scopeOf(x),
      () => currentClient().$queryRaw`SELECT id FROM business`,
    );
    await expect(singleConnection.$queryRaw`SELECT id FROM business`).rejects.toThrow(/tenant scope not set/);
  });

  it.each(TABLES)("4. erp_app cannot DELETE from %s, or alter the owner's table", async (table) => {
    await expect(asApp(x, () => currentClient().$executeRawUnsafe(`DELETE FROM ${table}`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asApp(x, () => currentClient().$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN probe int`)),
    ).rejects.toThrow(/must be owner/);
  });

  it("5. a business cannot reference another organization's legal entity", async () => {
    const insert = owner.$transaction(async (tx) => {
      const [businessId] = (await newIds(tx, 1)) as [string];
      await setScope(tx, x.organizationId, [businessId], []);
      await tx.$executeRaw`
        INSERT INTO business (id, organization_id, legal_entity_id, name)
        VALUES (${businessId}::uuid, ${x.organizationId}::uuid, ${y.legalEntityId}::uuid, 'Cross Link')`;
    });
    await expect(insert).rejects.toThrow(/foreign key/);
  });
});

describe('RLS is enabled and forced, and the source matches the migration', () => {
  it.each(TABLES)('%s has ROW LEVEL SECURITY enabled and forced', async (table) => {
    const rows = await owner.$queryRaw<{ enabled: boolean; forced: boolean }[]>`
      SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relname = ${table}
        AND relnamespace = 'public'::regnamespace`;
    expect(rows).toEqual([{ enabled: true, forced: true }]);
  });

  it('dal/sql/rls/organization.sql appears, unchanged, in the organization_tree migration', () => {
    const normalise = (sql: string) =>
      sql
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const source = normalise(readFileSync(`${DAL_DIR}sql/rls/organization.sql`, 'utf8'));
    const folder = migrationFolders().find((name) => name.endsWith('_organization_tree'));
    expect(folder, 'an organization_tree migration exists').toBeDefined();
    expect(normalise(migrationSql(folder as string))).toContain(source);
  });
});

describe('ADR 0009 added test cases', () => {
  it.each(TABLES)('1. erp_app cannot INSERT into %s', async (table) => {
    await expect(
      asApp(x, () =>
        currentClient().$executeRawUnsafe(`INSERT INTO ${table} (id) VALUES (public.uuid_v7())`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('2. a new business and branch have version 1, and version is NOT NULL', async () => {
    const rows = await asApp(
      x,
      () =>
        currentClient().$queryRaw<{ b: number; br: number }[]>`
        SELECT (SELECT version FROM business WHERE id = ${x.businessId}::uuid) AS b,
               (SELECT version FROM branch WHERE id = ${x.branchId}::uuid) AS br`,
    );
    expect(rows).toEqual([{ b: 1, br: 1 }]);
    const nullable = await owner.$queryRaw<{ table_name: string; is_nullable: string }[]>`
      SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'version' AND table_name IN ('business', 'branch')
       ORDER BY table_name`;
    expect(nullable).toEqual([
      { table_name: 'branch', is_nullable: 'NO' },
      { table_name: 'business', is_nullable: 'NO' },
    ]);
  });

  it("3. inside the fixture helper's transaction the app.* values hold its ids; the next transaction sees none", async () => {
    const ownerSingle = createDbClient(ownerUrl, { poolMax: 1, txTimeoutMs: 10_000 });
    try {
      const inside = await ownerSingle.$transaction(async (tx) => {
        await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
        return tx.$queryRaw<{ org: string; biz: string; br: string }[]>`
          SELECT current_setting('app.organization_id') AS org, current_setting('app.business_ids') AS biz,
                 current_setting('app.branch_ids') AS br`;
      });
      expect(inside).toEqual([{ org: x.organizationId, biz: x.businessId, br: x.branchId }]);
      const after = await ownerSingle.$queryRaw<{ org: string | null }[]>`
        SELECT nullif(current_setting('app.organization_id', true), '') AS org`;
      expect(after).toEqual([{ org: null }]);
    } finally {
      await ownerSingle.$disconnect();
    }
  });

  it('4. branch.short_code: format, unique per business, the same code allowed in another business', async () => {
    const accepted = await addBranch(owner, x.organizationId, x.businessId, 'AG2');
    expect(accepted).toMatch(/^[0-9a-f-]{36}$/);
    for (const bad of ['utt', 'U', 'TOOLONG', 'U-T', '2UT']) {
      await expect(addBranch(owner, x.organizationId, x.businessId, bad), bad).rejects.toThrow(
        /branch_short_code_format/,
      );
    }
    await expect(addBranch(owner, x.organizationId, x.businessId, 'UTT')).rejects.toThrow(/unique/);
    expect(y.shortCode).toBe('UTT');
  });

  it("5. erp_app can't change organization, legal_entity or any key column; the owner is stopped by the trigger", async () => {
    const denied = [
      `UPDATE organization SET name = 'x'`,
      `UPDATE legal_entity SET name = 'x'`,
      `UPDATE business SET organization_id = organization_id`,
      `UPDATE business SET legal_entity_id = legal_entity_id`,
      `UPDATE branch SET business_id = business_id`,
      `UPDATE branch SET short_code = short_code`,
    ];
    for (const statement of denied) {
      await expect(
        asApp(x, () => currentClient().$executeRawUnsafe(statement)),
        statement,
      ).rejects.toThrow(/permission denied/);
    }
    const otherLegal = await owner.$transaction(async (tx) => {
      const [id] = (await newIds(tx, 1)) as [string];
      await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
      await tx.$executeRaw`INSERT INTO legal_entity (id, organization_id, name) VALUES (${id}::uuid, ${x.organizationId}::uuid, 'Second Legal')`;
      return id;
    });
    // The dev and CI owner is a superuser, so RLS doesn't stop these and the trigger must. The non-superuser
    // owner's path (0 rows under forced RLS) is OrganizationTreeOwner.int.test.ts.
    const ownerChanges = [
      owner.$executeRaw`UPDATE business SET legal_entity_id = ${otherLegal}::uuid WHERE id = ${x.businessId}::uuid`,
      owner.$executeRaw`UPDATE branch SET short_code = 'NEW' WHERE id = ${x.branchId}::uuid`,
      owner.$executeRaw`UPDATE branch SET business_id = ${y.businessId}::uuid WHERE id = ${x.branchId}::uuid`,
    ];
    for (const change of ownerChanges) await expect(change).rejects.toThrow(/cannot change after insert/);
  });

  it('5b. erp_app can still edit the allowed columns, inside its scope', async () => {
    const changed = await asApp(
      x,
      () =>
        currentClient().$executeRaw`UPDATE branch SET name = 'Renamed Branch', version = version + 1
                                   WHERE id = ${x.branchId}::uuid AND version = 1`,
    );
    expect(changed).toBe(1);
  });

  it('7. business names are unique per organization, case-insensitive, even while deactivated', async () => {
    const tree = await createTree(owner, { businessName: 'Demo Motors' });
    await expect(addBusiness(owner, tree, 'demo motors')).rejects.toThrow(/unique/);
    const inactive = await addBusiness(owner, tree, 'Closed Shop', false);
    expect(inactive).toBeTruthy();
    await expect(addBusiness(owner, tree, 'CLOSED SHOP')).rejects.toThrow(/unique/);
    const other = await createTree(owner, { businessName: 'Demo Motors' });
    expect(other.businessName).toBe('Demo Motors');
  });

  it.each(TABLES)('10. TRUNCATE on %s is refused, as the superuser owner too', async (table) => {
    // Always rolled back: if the trigger were ever missing, CASCADE as a superuser would empty the dev database.
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE ${table} CASCADE`);
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    const error = await attempt.then(
      () => undefined,
      (caught: unknown) => caught,
    );
    // On a failure, print the whole error and its SQLSTATE, so an intermittent cause (a lock, a deadlock) is seen.
    const meta = (error as { meta?: unknown } | undefined)?.meta;
    const sqlState = /\b(?:Code|code)\W+([0-9A-Z]{5})\b/.exec(
      `${String(error)} ${JSON.stringify(meta ?? {})}`,
    )?.[1];
    const detail = `SQLSTATE ${sqlState ?? 'unknown'}\n${String(error)}\nmeta: ${JSON.stringify(meta ?? null)}`;
    expect(String(error), detail).toMatch(/TRUNCATE is refused/);
  });
});
