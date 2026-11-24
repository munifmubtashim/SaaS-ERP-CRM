import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { NumberSeriesQuery } from '../query/NumberSeriesQuery.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';
import { sourceIsInMigration } from './support/tableRules.js';

/**
 * ADR 0055: an AFTER INSERT trigger on business creates the business's walk-in party and its business-wide
 * party_code series, in the same transaction, as the function's owner, with RLS still forced. Tests 1 to 8.
 *
 * The dev and CI migration owner is a superuser, which skips RLS, so the scope switch inside the function is
 * proved on an owner that is neither superuser nor BYPASSRLS (createOwnerDatabase). The provisioner path runs on
 * the main database with SET LOCAL ROLE, as OrganizationProvisioning.int.test.ts does.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const PROVISIONER = 'erp_provisioner';
const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

interface WalkInRow {
  code: string;
  name: string;
  phone_e164: string;
  is_customer: boolean;
  is_supplier: boolean;
  created_by: string | null;
}
interface SeriesRow {
  prefix: string;
  width: number;
  next_value: string;
}

/** A business created by erp_provisioner, with app.organization_id only (ADR 0010). Returns its id. */
async function provisionBusiness(tree: Tree): Promise<string> {
  return owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROVISIONER}`);
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${tree.organizationId}, true)`;
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO business (organization_id, legal_entity_id, name)
      VALUES (${tree.organizationId}::uuid, ${tree.legalEntityId}::uuid, ${`Walk-in Test ${Date.now()}-${Math.random()}`})
      RETURNING id::text`;
    if (!row) throw new Error('no business');
    return row.id;
  });
}

/** What erp_app sees in one business's scope. */
async function asApp<T>(tree: Tree, businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [businessId], []);
    return fn(tx);
  });
}

const walkIns = (tx: Tx, businessId: string) => tx.$queryRaw<WalkInRow[]>`
  SELECT code, name, phone_e164, is_customer, is_supplier, created_by::text
    FROM party WHERE business_id = ${businessId}::uuid AND is_walk_in`;
const partyCodeSeries = (tx: Tx, businessId: string) => tx.$queryRaw<SeriesRow[]>`
  SELECT prefix, width, next_value::text FROM number_series
   WHERE business_id = ${businessId}::uuid AND branch_id IS NULL AND kind = 'party_code'`;

let x: Tree;
let y: Tree;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('ADR 0055 test 1: a provisioned business gets its walk-in party and party_code series', () => {
  it('exactly one walk-in party (WALK-IN, placeholder phone, no created_by) and one C- series of width 6', async () => {
    const businessId = await provisionBusiness(x);
    const [parties, series] = await asApp(x, businessId, async (tx) => [
      await walkIns(tx, businessId),
      await partyCodeSeries(tx, businessId),
    ]);
    expect(parties).toEqual([
      {
        code: 'WALK-IN',
        name: 'Walk-in customer',
        phone_e164: '+8801000000000',
        is_customer: true,
        is_supplier: false,
        created_by: null,
      },
    ]);
    expect(series).toEqual([{ prefix: 'C-', width: 6, next_value: '1' }]);
  });

  it('every business, including those created before the migration, has exactly one walk-in party (backfill)', async () => {
    const missing = await owner.$queryRaw<{ id: string }[]>`
      SELECT b.id::text FROM business b
       WHERE (SELECT count(*) FROM party p WHERE p.business_id = b.id AND p.is_walk_in) <> 1
          OR NOT EXISTS (SELECT 1 FROM number_series s
                          WHERE s.business_id = b.id AND s.branch_id IS NULL AND s.kind = 'party_code')`;
    expect(missing).toEqual([]);
  });
});

describe("ADR 0055 test 2: the caller's app.business_ids is exactly as it was", () => {
  it('unset (the provisioner): still empty after the insert, so app_business_ids() still refuses', async () => {
    const after = await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROVISIONER}`);
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${x.organizationId}, true)`;
      const [before] = await tx.$queryRaw<{ v: string | null }[]>`
        SELECT current_setting('app.business_ids', true) AS v`;
      await tx.$executeRaw`
        INSERT INTO business (organization_id, legal_entity_id, name)
        VALUES (${x.organizationId}::uuid, ${x.legalEntityId}::uuid, ${`Unset Scope ${Date.now()}`})`;
      const [value] = await tx.$queryRaw<{ v: string | null }[]>`
        SELECT current_setting('app.business_ids', true) AS v`;
      // app_business_ids() must still refuse: probe it inside a savepoint so the transaction survives.
      await tx.$executeRaw`SAVEPOINT probe`;
      const refused = await tx.$queryRaw`SELECT public.app_business_ids()`.then(
        () => false,
        () => true,
      );
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT probe`;
      return { before: before?.v ?? null, after: value?.v ?? null, refused };
    });
    expect(after.before ?? '').toBe('');
    expect(after.after ?? '').toBe('');
    expect(after.refused).toBe(true);
  });

  describe('set (an owner that is neither superuser nor BYPASSRLS, so RLS is forced on the function)', () => {
    let db: OwnerDatabase;
    let tree: Tree;

    beforeAll(async () => {
      db = await createOwnerDatabase(ownerUrl);
      tree = await createTree(db.client);
    }, 120_000);

    afterAll(async () => {
      await db.drop();
    });

    it('keeps a list that holds more than the new business, and still writes both rows', async () => {
      const result = await db.client.$transaction(async (tx) => {
        const [businessId] = (await newIds(tx, 1)) as [string];
        const scope = `${businessId},${tree.businessId}`;
        await tx.$queryRaw`
          SELECT set_config('app.organization_id', ${tree.organizationId}, true),
                 set_config('app.business_ids', ${scope}, true)`;
        await tx.$executeRaw`
          INSERT INTO business (id, organization_id, legal_entity_id, name)
          VALUES (${businessId}::uuid, ${tree.organizationId}::uuid, ${tree.legalEntityId}::uuid, 'Owner Path Business')`;
        const [value] = await tx.$queryRaw<{ v: string }[]>`SELECT current_setting('app.business_ids') AS v`;
        return {
          scope,
          after: value?.v,
          walkIns: await walkIns(tx, businessId),
          series: await partyCodeSeries(tx, businessId),
        };
      });
      expect(result.after).toBe(result.scope);
      expect(result.walkIns).toHaveLength(1);
      expect(result.series).toEqual([{ prefix: 'C-', width: 6, next_value: '1' }]);
    });
  });
});

describe('ADR 0055 tests 3 and 4: tenancy and the one walk-in per business', () => {
  it("business Y's scope sees neither row of business X", async () => {
    const businessId = await provisionBusiness(x);
    const seen = await asApp(y, y.businessId, async (tx) => [
      await walkIns(tx, businessId),
      await partyCodeSeries(tx, businessId),
    ]);
    expect(seen).toEqual([[], []]);
  });

  it('a second walk-in party for the same business is still refused by the index', async () => {
    const businessId = await provisionBusiness(x);
    const second = owner.$transaction(async (tx) => {
      await setScope(tx, x.organizationId, [businessId], []);
      await tx.$executeRaw`
        INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, is_walk_in)
        VALUES (${businessId}::uuid, 'WALK-IN-2', 'Second walk-in', 'person', true, false, '+8801000000000', true)`;
    });
    await expect(second).rejects.toThrow(/party_one_walk_in_per_business|unique/i);
  });
});

describe('ADR 0055 tests 5 and 6: no new grants; the function runs as its owner only from the trigger', () => {
  it.each(['party', 'number_series'])('erp_provisioner has no privilege on %s', async (table) => {
    const [row] = await owner.$queryRaw<{ any: boolean }[]>`
      SELECT has_table_privilege(${PROVISIONER}, ${table}, 'SELECT, INSERT, UPDATE, DELETE') AS any`;
    expect(row?.any).toBe(false);
  });

  it('party_provision_business() is SECURITY DEFINER, owned by the owner of business, and PUBLIC cannot execute it', async () => {
    const [row] = await owner.$queryRaw<
      {
        definer: boolean;
        same_owner: boolean;
        app_exec: boolean;
        prov_exec: boolean;
        search_path: string | null;
      }[]
    >`
      SELECT p.prosecdef AS definer,
             p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.business'::regclass) AS same_owner,
             has_function_privilege('erp_app', p.oid, 'EXECUTE') AS app_exec,
             has_function_privilege(${PROVISIONER}, p.oid, 'EXECUTE') AS prov_exec,
             array_to_string(p.proconfig, ';') AS search_path
        FROM pg_proc p WHERE p.oid = 'public.party_provision_business()'::regprocedure`;
    expect(row).toEqual({
      definer: true,
      same_owner: true,
      app_exec: false,
      prov_exec: false,
      search_path: 'search_path=pg_catalog, public',
    });
  });

  it('the trigger is AFTER INSERT FOR EACH ROW on business', async () => {
    const rows = await owner.$queryRaw<{ name: string; definition: string }[]>`
      SELECT tgname AS name, pg_get_triggerdef(oid) AS definition FROM pg_trigger
       WHERE tgrelid = 'public.business'::regclass AND tgname = 'business_provision_party'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.definition).toMatch(
      /AFTER INSERT ON public\.business FOR EACH ROW EXECUTE FUNCTION (public\.)?party_provision_business\(\)/,
    );
  });
});

describe('ADR 0055 test 7: the source matches the migration', () => {
  it('dal/sql/triggers/party_provisioning.sql appears, unchanged, in the party_provisioning migration', () => {
    expect(sourceIsInMigration('sql/triggers/party_provisioning.sql', 'party_provisioning')).toBe(true);
  });
});

describe('ADR 0055 test 8: the series numbers parties from C-000001', () => {
  it('the first two party codes of a new business are 1 and 2 on the C- series of width 6', async () => {
    const businessId = await provisionBusiness(x);
    const query = new NumberSeriesQuery();
    const taken = await runInTenantScope(
      app,
      // branchIds needs one entry; the party_code series is business-wide (branch_id null), so x's branch is enough.
      { organizationId: x.organizationId, businessIds: [businessId], branchIds: [x.branchId] },
      async () => [await query.take('party_code', null), await query.take('party_code', null)],
    );
    expect(taken).toEqual([
      { prefix: 'C-', value: '1', width: 6 },
      { prefix: 'C-', value: '2', width: 6 },
    ]);
  });
});
