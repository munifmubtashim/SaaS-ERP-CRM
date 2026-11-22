import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { addBranch, createTree, newIds, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration serial_units (ADR 0020 part 2): the serial_unit table's rules, tested in SQL. ADR 0020 tests 1 to 8 and
 * 11 at the database level; selling an archived product (test 9) and the response schemas (test 10) belong to
 * IUnitSale and the shared schemas. Fixtures are written as the migration owner inside the scope they set.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let y: Tree;
let branchB: string;
let bikeX: string;
let oilX: string;
let bikeY: string;

const freshSerial = () => `CH-${randomBytes(6).toString('hex').toUpperCase()}`;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>, branchIds = [tree.branchId]) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

async function addProduct(db: DbClient, tree: Tree, tracking: 'serial' | 'quantity'): Promise<string> {
  return inScope(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${tree.businessId}::uuid, ${`P-${randomBytes(5).toString('hex')}`}, 'Test product', 'pcs', ${tracking},
              180000.00)
      RETURNING id::text`;
    if (!row) throw new Error('the insert returned no row');
    return row.id;
  });
}

interface UnitFields {
  productId?: string;
  branchId?: string;
  serialNo?: string;
  unitCost?: string;
}

/** Inserts a unit on `db` (erp_app or an owner) in the tree's scope, with `branchIds` in scope. Returns its id. */
async function addUnit(
  db: DbClient,
  tree: Tree,
  productId: string,
  fields: UnitFields = {},
  branchIds?: string[],
): Promise<string> {
  const branchId = fields.branchId ?? tree.branchId;
  return inScope(
    db,
    tree,
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
        VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${fields.productId ?? productId}::uuid,
                ${fields.serialNo ?? freshSerial()}, ${fields.unitCost ?? '150000.00'}::numeric)
        RETURNING id::text`;
      if (!row) throw new Error('the insert returned no row');
      return row.id;
    },
    branchIds ?? [branchId],
  );
}

/** ADR 0020 section 2: the conditional sell. Returns the rows it changed (the unit cost when it won). */
const sell = (tx: Tx, unitId: string, branchId: string, invoiceId: string) =>
  tx.$queryRaw<{ cost: string }[]>`
    UPDATE serial_unit SET status = 'sold', invoice_id = ${invoiceId}::uuid, version = version + 1
    WHERE id = ${unitId}::uuid AND branch_id = ${branchId}::uuid AND status = 'in_stock'
    RETURNING unit_cost::text AS cost`;

/** Moves a unit to `status` as erp_app, in X's scope. */
const setStatus = (unitId: string, status: string) =>
  inScope(
    app,
    x,
    (tx) => tx.$executeRaw`UPDATE serial_unit SET status = ${status} WHERE id = ${unitId}::uuid`,
  );

/** Deactivates a branch. The dev and CI owner is a superuser, so it can do so without a scope. */
const deactivate = (branchId: string) =>
  owner.$executeRaw`UPDATE branch SET is_active = false WHERE id = ${branchId}::uuid`;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'SUB');
  [bikeX, oilX, bikeY] = await Promise.all([
    addProduct(owner, x, 'serial'),
    addProduct(owner, x, 'quantity'),
    addProduct(owner, y, 'serial'),
  ]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'serial_unit')).toEqual([{ enabled: true, forced: true }]);
  });

  it('every policy names its role (erp_app or the migration owner); there is no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'serial_unit');
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

  it('erp_app holds SELECT and INSERT, and UPDATE on status, invoice_id, reserved_by_ref, version, updated_at only', async () => {
    expect(await tablePrivileges(owner, 'serial_unit', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'serial_unit' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'
      ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual([
      'invoice_id',
      'reserved_by_ref',
      'status',
      'updated_at',
      'version',
    ]);
  });

  it('both foreign keys are composite with business_id', async () => {
    const rows = await owner.$queryRaw<{ name: string; definition: string }[]>`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'serial_unit'::regclass AND contype = 'f' ORDER BY conname`;
    expect(rows).toEqual([
      {
        name: 'serial_unit_business_id_branch_id_fkey',
        definition:
          'FOREIGN KEY (business_id, branch_id) REFERENCES branch(business_id, id) ON UPDATE CASCADE ON DELETE RESTRICT',
      },
      {
        name: 'serial_unit_business_id_product_id_fkey',
        definition:
          'FOREIGN KEY (business_id, product_id) REFERENCES product(business_id, id) ON UPDATE CASCADE ON DELETE RESTRICT',
      },
    ]);
  });

  it('dal/sql/rls/serial_unit.sql appears, unchanged, in the serial_units migration', () => {
    expect(sourceIsInMigration('sql/rls/serial_unit.sql', 'serial_units')).toBe(true);
  });
});

describe('ADR 0020 test 1: units are seen only in their business and branch', () => {
  it('erp_app creates a unit in its branch and reads it back with its cost', async () => {
    const id = await addUnit(app, x, bikeX, { unitCost: '152500.75' });
    const rows = await inScope(
      app,
      x,
      (tx) =>
        tx.$queryRaw<{ status: string; cost: string }[]>`
        SELECT status, unit_cost::text AS cost FROM serial_unit WHERE id = ${id}::uuid`,
    );
    expect(rows).toEqual([{ status: 'in_stock', cost: '152500.75' }]);
  });

  it("in X, erp_app sees and changes nothing of Y's units, even by id, and cannot create one in Y", async () => {
    const idY = await addUnit(owner, y, bikeY);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM serial_unit WHERE id = ${idY}::uuid`).toEqual([]);
      expect(await tx.$executeRaw`UPDATE serial_unit SET status = 'reserved' WHERE id = ${idY}::uuid`).toBe(
        0,
      );
    });
    await expect(
      inScope(
        app,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
          VALUES (${y.businessId}::uuid, ${y.branchId}::uuid, ${bikeY}::uuid, ${freshSerial()}, 1.00)`,
        [x.branchId, y.branchId],
      ),
      // The BEFORE INSERT trigger runs before the policy's WITH CHECK and reads product under the caller's RLS:
      // Y's product is invisible in X's scope, so the trigger refuses first. Either way, nothing is written.
    ).rejects.toThrow(/row-level security|is not serial-tracked/);
  });

  it('with only branch A in scope, erp_app sees, sells and creates nothing in branch B', async () => {
    const idB = await addUnit(owner, x, bikeX, { branchId: branchB });
    const [invoice] = (await newIds(owner, 1)) as [string];
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM serial_unit WHERE id = ${idB}::uuid`).toEqual([]);
      expect(await sell(tx, idB, branchB, invoice)).toEqual([]);
    });
    await expect(
      inScope(
        app,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
          VALUES (${x.businessId}::uuid, ${branchB}::uuid, ${bikeX}::uuid, ${freshSerial()}, 1.00)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM serial_unit`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('ADR 0020 tests 2 to 4: what a unit may name', () => {
  it("2. a unit naming another business's branch is refused (composite foreign key)", async () => {
    await expect(
      addUnit(owner, x, bikeX, { branchId: y.branchId }, [x.branchId, y.branchId]),
    ).rejects.toThrow(/serial_unit_business_id_branch_id_fkey/);
  });

  it("2. a unit naming another business's product is refused (the product is not found in this business)", async () => {
    await expect(addUnit(owner, x, bikeY)).rejects.toThrow(
      /not serial-tracked|serial_unit_business_id_product_id_fkey/,
    );
  });

  it('3. a unit of a quantity-tracked product is refused (trigger)', async () => {
    await expect(addUnit(owner, x, oilX)).rejects.toThrow(/is not serial-tracked/);
  });

  it('4. a second unit with the same serial number in the business is refused; in another business it is accepted', async () => {
    const serialNo = freshSerial();
    await addUnit(owner, x, bikeX, { serialNo });
    await expect(addUnit(owner, x, bikeX, { serialNo, branchId: branchB })).rejects.toThrow(
      /serial_unit_business_id_serial_no_key/,
    );
    await expect(addUnit(owner, y, bikeY, { serialNo })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('ADR 0020 tests 5 and 6: status changes', () => {
  it('5. two parallel sells of one unit: exactly one gets the row, with its cost', async () => {
    const unit = await addUnit(owner, x, bikeX, { unitCost: '149000.00' });
    const [invoiceA, invoiceB] = (await newIds(owner, 2)) as [string, string];
    const results = await Promise.all(
      [invoiceA, invoiceB].map((invoice) => inScope(app, x, (tx) => sell(tx, unit, x.branchId, invoice))),
    );
    expect(results.map((rows) => rows.length).sort()).toEqual([0, 1]);
    expect(results.flat()).toEqual([{ cost: '149000.00' }]);
  });

  it('5. the losing sell waits for the winner, then changes nothing, and nothing of its transaction remains', async () => {
    const unit = await addUnit(owner, x, bikeX);
    const [invoiceA, invoiceB] = (await newIds(owner, 2)) as [string, string];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let sold!: () => void;
    const firstSold = new Promise<void>((resolve) => (sold = resolve));
    const first = inScope(app, x, async (tx) => {
      await sell(tx, unit, x.branchId, invoiceA);
      sold();
      await held;
    });
    await firstSold;
    let settled = false;
    const second = inScope(app, x, (tx) => sell(tx, unit, x.branchId, invoiceB)).finally(
      () => (settled = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);
    release();
    await first;
    expect(await second).toEqual([]);
    const rows = await inScope(
      app,
      x,
      (tx) =>
        tx.$queryRaw<{ status: string; invoice: string; version: number }[]>`
        SELECT status, invoice_id::text AS invoice, version FROM serial_unit WHERE id = ${unit}::uuid`,
    );
    expect(rows).toEqual([{ status: 'sold', invoice: invoiceA, version: 2 }]);
  });

  it.each([
    ['in_stock', ['reserved', 'in_stock', 'sold', 'delivered']],
    ['in_stock', ['sold']],
    ['in_stock', ['reserved', 'sold']],
  ] as const)('the allowed path from %s through %j is accepted', async (_from, path) => {
    const unit = await addUnit(owner, x, bikeX);
    for (const status of path) expect(await setStatus(unit, status), status).toBe(1);
  });

  it.each([
    [['sold'], 'in_stock'],
    [['sold', 'delivered'], 'sold'],
    [['sold', 'delivered'], 'in_stock'],
    [['sold'], 'reserved'],
    [['reserved'], 'delivered'],
    [[], 'delivered'],
  ] as const)('6. after %j, a change to %s is refused by the trigger', async (before, refused) => {
    const unit = await addUnit(owner, x, bikeX);
    for (const status of before) await setStatus(unit, status);
    await expect(setStatus(unit, refused)).rejects.toThrow(/serial_unit: status .* is not allowed/);
  });

  it('6. the owner cannot move a sold unit back to in_stock either (the trigger holds for every role)', async () => {
    const unit = await addUnit(owner, x, bikeX);
    await setStatus(unit, 'sold');
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE serial_unit SET status = 'in_stock' WHERE id = ${unit}::uuid`,
      ),
    ).rejects.toThrow(/status sold to in_stock is not allowed/);
  });
});

describe('ADR 0020 tests 7 and 8: rights', () => {
  it.each(['serial_no', 'product_id', 'unit_cost', 'branch_id', 'business_id', 'created_at'])(
    '7. erp_app cannot UPDATE %s (permission denied)',
    async (column) => {
      await expect(
        inScope(app, x, (tx) =>
          tx.$executeRawUnsafe(`UPDATE serial_unit SET ${column} = ${column} WHERE false`),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it.each([
    ["serial_no = 'CHANGED'", 'serial_no'],
    ['unit_cost = unit_cost + 1', 'unit_cost'],
  ])('7. the owner cannot change %s either (trigger)', async (change) => {
    const unit = await addUnit(owner, x, bikeX);
    await expect(
      inScope(owner, x, (tx) =>
        tx.$executeRawUnsafe(`UPDATE serial_unit SET ${change} WHERE id = '${unit}'::uuid`),
      ),
    ).rejects.toThrow(/serial_no, product_id, unit_cost and business_id never change/);
  });

  it('8. erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM serial_unit WHERE false')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe('TRUNCATE serial_unit')).rejects.toThrow(/permission denied/);
  });

  it('8. a BEFORE TRUNCATE trigger refuses TRUNCATE for every role', async () => {
    expect(await truncateRefusers(owner, 'serial_unit')).toEqual(['serial_unit_no_truncate']);
  });

  it('8. TRUNCATE is refused for the superuser owner, even with CASCADE', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE serial_unit CASCADE');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    // With CASCADE, a table that references serial_unit (vehicle_unit, later) may refuse first; every one does.
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on/);
  });
});

describe('ADR 0020 test 11: nothing is written to a deactivated branch', () => {
  it('erp_app cannot add a unit under a deactivated branch, even with it in scope', async () => {
    const closed = await addBranch(owner, x.organizationId, x.businessId, 'SUC');
    await deactivate(closed);
    await expect(addUnit(app, x, bikeX, { branchId: closed })).rejects.toThrow(/row-level security/);
  });

  it('erp_app cannot sell a unit of a branch deactivated after the unit arrived', async () => {
    const closing = await addBranch(owner, x.organizationId, x.businessId, 'SUD');
    const unit = await addUnit(owner, x, bikeX, { branchId: closing });
    await deactivate(closing);
    const [invoice] = (await newIds(owner, 1)) as [string];
    await expect(inScope(app, x, (tx) => sell(tx, unit, closing, invoice), [closing])).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe('constraints', () => {
  it('an unknown status is refused on insert (CHECK); on update the status trigger refuses it first', async () => {
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, status, unit_cost)
          VALUES (${x.businessId}::uuid, ${x.branchId}::uuid, ${bikeX}::uuid, ${freshSerial()}, 'registered', 1.00)`,
      ),
    ).rejects.toThrow(/serial_unit_status_known/);
    const unit = await addUnit(owner, x, bikeX);
    await expect(setStatus(unit, 'registered')).rejects.toThrow(
      /status in_stock to registered is not allowed/,
    );
  });

  it('a negative cost is refused', async () => {
    await expect(addUnit(owner, x, bikeX, { unitCost: '-0.01' })).rejects.toThrow(
      /serial_unit_cost_nonnegative/,
    );
  });
});

describe('ADR 0020 test 8: an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;
  let tree: Tree;
  let other: Tree;
  let bike: string;

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
    tree = await createTree(db.client);
    other = await createTree(db.client);
    bike = await addProduct(db.client, tree, 'serial');
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('inserts and reads a unit inside the business and branch it set', async () => {
    const unit = await addUnit(db.client, tree, bike);
    const seen = await inScope(
      db.client,
      tree,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM serial_unit`,
    );
    expect(seen).toEqual([{ id: unit }]);
  });

  it('an insert into a business outside the scope it set is refused', async () => {
    const otherBike = await addProduct(db.client, other, 'serial');
    await expect(
      inScope(
        db.client,
        tree,
        (tx) => tx.$executeRaw`
          INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
          VALUES (${other.businessId}::uuid, ${other.branchId}::uuid, ${otherBike}::uuid, ${freshSerial()}, 1.00)`,
        [tree.branchId, other.branchId],
      ),
      // As for erp_app: the product trigger reads under this owner's RLS and refuses before the policy's check.
    ).rejects.toThrow(/row-level security|is not serial-tracked/);
  });

  it('with no app.* values set, reading fails with "tenant scope not set"', async () => {
    await expect(db.client.$queryRaw`SELECT id FROM serial_unit`).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows and the rows remain; a TRUNCATE is refused', async () => {
    const result = await inScope(db.client, tree, async (tx) => ({
      deleted: await tx.$executeRawUnsafe('DELETE FROM serial_unit'),
      left: (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM serial_unit`)[0]?.n,
    }));
    expect(result).toEqual({ deleted: 0, left: 1 });
    // Refused by the trigger, or first by PostgreSQL once another table references serial_unit.
    await expect(db.client.$executeRawUnsafe('TRUNCATE serial_unit')).rejects.toThrow(
      /TRUNCATE is refused on serial_unit|cannot truncate a table referenced/,
    );
  });
});
