import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration product_catalogue (ADR 0020 part 1): the product table's rules, tested in SQL. ADR 0020 tests 1, 7 and
 * 8 for the product half; ProductQuery and the list route come with their own PR. Every test uses fresh codes.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 10_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let y: Tree;

const freshCode = () => `P-${randomBytes(5).toString('hex')}`;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return fn(tx);
  });
}

interface ProductFields {
  code?: string;
  tracking?: string;
  status?: string;
  sellPrice?: string;
  businessId?: string;
}

/** Inserts a product in `tree`'s scope on `db` (erp_app or an owner). Returns its id. */
async function addProduct(db: DbClient, tree: Tree, fields: ProductFields = {}): Promise<string> {
  return inScope(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price, status)
      VALUES (${fields.businessId ?? tree.businessId}::uuid, ${fields.code ?? freshCode()}, 'Brake pad', 'pcs',
              ${fields.tracking ?? 'quantity'}, ${fields.sellPrice ?? '450.00'}::numeric, ${fields.status ?? 'active'})
      RETURNING id::text`;
    if (!row) throw new Error('the insert returned no row');
    return row.id;
  });
}

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'product')).toEqual([{ enabled: true, forced: true }]);
  });

  it('every policy names its role (erp_app or the migration owner); there is no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'product');
    expect(rows.map((row) => `${row.cmd} ${row.roles.join(',')}`).sort()).toEqual(
      [
        'INSERT erp_app',
        `INSERT ${me}`,
        'SELECT erp_app',
        `SELECT ${me}`,
        'UPDATE erp_app',
        `UPDATE ${me}`,
      ].sort(),
    );
  });

  it('erp_app holds SELECT and INSERT, and UPDATE on every column but id, business_id, code, tracking and the audit columns', async () => {
    expect(await tablePrivileges(owner, 'product', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'product' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'
      ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual([
      'brand',
      'category',
      'name',
      'name_bn',
      'sell_price',
      'status',
      'unit',
      'updated_at',
      'version',
    ]);
  });

  it('dal/sql/rls/product.sql appears, unchanged, in the product_catalogue migration', () => {
    expect(sourceIsInMigration('sql/rls/product.sql', 'product_catalogue')).toBe(true);
  });
});

describe('ADR 0020 test 1 (product half): erp_app writes products, and only in its business', () => {
  it('erp_app creates a product and reads it back; the price is exact', async () => {
    const id = await addProduct(app, x, { sellPrice: '12500.55' });
    const rows = await inScope(
      app,
      x,
      (tx) =>
        tx.$queryRaw<{ price: string; version: number; status: string }[]>`
        SELECT sell_price::text AS price, version, status FROM product WHERE id = ${id}::uuid`,
    );
    expect(rows).toEqual([{ price: '12500.55', version: 1, status: 'active' }]);
  });

  it('erp_app edits the name, price and status, raising the version', async () => {
    const id = await addProduct(app, x);
    await inScope(app, x, async (tx) => {
      expect(
        await tx.$executeRaw`
          UPDATE product SET name = 'Brake pad, rear', sell_price = 475.00, status = 'archived', version = version + 1,
                 updated_at = now()
          WHERE id = ${id}::uuid AND version = 1`,
      ).toBe(1);
    });
  });

  it("in X, erp_app sees and changes nothing of Y's products, even by id, and cannot create one in Y", async () => {
    const idY = await addProduct(owner, y);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM product WHERE id = ${idY}::uuid`).toEqual([]);
      expect(await tx.$queryRaw`SELECT id FROM product WHERE business_id = ${y.businessId}::uuid`).toEqual(
        [],
      );
      expect(await tx.$executeRaw`UPDATE product SET name = 'X' WHERE id = ${idY}::uuid`).toBe(0);
    });
    await expect(addProduct(app, x, { businessId: y.businessId })).rejects.toThrow(/row-level security/);
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM product`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('ADR 0020 test 7 (product half): erp_app grants', () => {
  it.each(['code', 'tracking', 'business_id', 'id', 'created_at', 'created_by'])(
    'erp_app cannot UPDATE %s',
    async (column) => {
      await expect(
        inScope(app, x, (tx) => tx.$executeRawUnsafe(`UPDATE product SET ${column} = ${column} WHERE false`)),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM product WHERE false')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe('TRUNCATE product')).rejects.toThrow(/permission denied/);
  });
});

describe('constraints', () => {
  it('a code is unique per business; the same code in another business is accepted', async () => {
    const code = freshCode();
    await addProduct(owner, x, { code });
    await expect(addProduct(owner, x, { code })).rejects.toThrow(/product_business_id_code_key/);
    await expect(addProduct(owner, y, { code })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['tracking', { tracking: 'batch' }, /product_tracking_known/],
    ['status', { status: 'deleted' }, /product_status_known/],
    ['sell_price', { sellPrice: '-0.01' }, /product_sell_price_nonnegative/],
  ] as const)('an unknown or negative %s is refused', async (_name, fields, error) => {
    await expect(addProduct(owner, x, fields)).rejects.toThrow(error);
  });

  it('a price with more than two decimals is rounded by numeric(18,2), never stored as a float', async () => {
    const id = await addProduct(owner, x, { sellPrice: '10.005' });
    const rows = await inScope(
      owner,
      x,
      (tx) =>
        tx.$queryRaw<{ price: string; type: string }[]>`
        SELECT sell_price::text AS price, pg_typeof(sell_price)::text AS type FROM product WHERE id = ${id}::uuid`,
    );
    expect(rows).toEqual([{ price: '10.01', type: 'numeric' }]);
  });

  it('an unknown business is refused', async () => {
    const [unknown] = (await newIds(owner, 1)) as [string];
    await expect(addProduct(owner, x, { businessId: unknown })).rejects.toThrow(
      /row-level security|business_id_fkey/,
    );
  });

  it('a BEFORE TRUNCATE trigger refuses TRUNCATE for every role', async () => {
    expect(await truncateRefusers(owner, 'product')).toEqual(['product_no_truncate']);
  });

  it('TRUNCATE is refused for the superuser owner, even with CASCADE', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE product CASCADE');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    // With CASCADE, a table that references product (serial_unit, later) may refuse first; every one does.
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on/);
  });
});

describe('ADR 0020 test 8 (product half): an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;
  let tree: Tree;
  let other: Tree;

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
    tree = await createTree(db.client);
    other = await createTree(db.client);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('inserts and reads a product inside the business it set, and sees no other business', async () => {
    const mine = await addProduct(db.client, tree);
    await addProduct(db.client, other);
    const seen = await inScope(
      db.client,
      tree,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM product`,
    );
    expect(seen).toEqual([{ id: mine }]);
  });

  it('an insert into a business outside the scope it set is refused by its own policy', async () => {
    await expect(addProduct(db.client, tree, { businessId: other.businessId })).rejects.toThrow(
      /row-level security/,
    );
  });

  it('with no app.* values set, reading fails with "tenant scope not set"', async () => {
    await expect(db.client.$queryRaw`SELECT id FROM product`).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows and the rows remain; a TRUNCATE is refused', async () => {
    const result = await inScope(db.client, tree, async (tx) => ({
      deleted: await tx.$executeRawUnsafe('DELETE FROM product'),
      left: (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM product`)[0]?.n,
    }));
    expect(result.deleted).toBe(0);
    expect(result.left).toBeGreaterThan(0);
    // Refused by the trigger, or first by PostgreSQL once another table references product (same as
    // OrganizationTreeOwner.int.test.ts).
    await expect(db.client.$executeRawUnsafe('TRUNCATE product')).rejects.toThrow(
      /TRUNCATE is refused on product|cannot truncate a table referenced/,
    );
  });
});
