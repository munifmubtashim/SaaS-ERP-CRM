import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration vehicle_units (ADR 0020 part 3, Vehicle pack only, spec O-11): the vehicle_unit table's rules, tested in
 * SQL. ADR 0020 tests 1, 2, 4, 7 and 8 for the vehicle half. A vehicle row is seen where its unit is seen: the
 * business, and the unit's branch through serial_unit's own RLS.
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
let branchB: string;
let bikeX: string;
let bikeY: string;

const fresh = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>, branchIds = [tree.branchId]) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

async function addBike(db: DbClient, tree: Tree): Promise<string> {
  return inScope(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${tree.businessId}::uuid, ${fresh('P')}, 'Test bike', 'pcs', 'serial', 180000.00)
      RETURNING id::text`;
    if (!row) throw new Error('the insert returned no row');
    return row.id;
  });
}

/** A serial unit of `productId` in `branchId` (default: the tree's branch), inserted as `db`. Returns its id. */
async function addUnit(
  db: DbClient,
  tree: Tree,
  productId: string,
  branchId = tree.branchId,
): Promise<string> {
  return inScope(
    db,
    tree,
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
        VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${productId}::uuid, ${fresh('CH')}, 150000.00)
        RETURNING id::text`;
      if (!row) throw new Error('the insert returned no row');
      return row.id;
    },
    [branchId],
  );
}

/** The vehicle row for a unit, inserted as `db` in the tree's scope with `branchIds` in scope. */
function addVehicle(
  db: DbClient,
  tree: Tree,
  unitId: string,
  fields: { engineNo?: string; businessId?: string } = {},
  branchIds = [tree.branchId],
): Promise<number> {
  return inScope(
    db,
    tree,
    (tx) => tx.$executeRaw`
      INSERT INTO vehicle_unit (serial_unit_id, business_id, engine_no, colour)
      VALUES (${unitId}::uuid, ${fields.businessId ?? tree.businessId}::uuid, ${fields.engineNo ?? fresh('EN')}, 'Red')`,
    branchIds,
  );
}

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'VUB');
  [bikeX, bikeY] = await Promise.all([addBike(owner, x), addBike(owner, y)]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'vehicle_unit')).toEqual([{ enabled: true, forced: true }]);
  });

  it('every policy names its role (erp_app or the migration owner); there is no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'vehicle_unit');
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

  it('erp_app holds SELECT and INSERT, and UPDATE on colour and updated_at only', async () => {
    expect(await tablePrivileges(owner, 'vehicle_unit', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'vehicle_unit' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'
      ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual(['colour', 'updated_at']);
  });

  it('the foreign key to serial_unit is composite with business_id', async () => {
    const rows = await owner.$queryRaw<{ definition: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'vehicle_unit'::regclass AND contype = 'f'`;
    expect(rows).toEqual([
      {
        definition:
          'FOREIGN KEY (business_id, serial_unit_id) REFERENCES serial_unit(business_id, id) ON UPDATE CASCADE ON DELETE RESTRICT',
      },
    ]);
  });

  it('a BEFORE TRUNCATE trigger refuses TRUNCATE for every role', async () => {
    expect(await truncateRefusers(owner, 'vehicle_unit')).toEqual(['vehicle_unit_no_truncate']);
  });

  it('dal/sql/rls/vehicle_unit.sql appears, unchanged, in the vehicle_units migration', () => {
    expect(sourceIsInMigration('sql/rls/vehicle_unit.sql', 'vehicle_units')).toBe(true);
  });
});

describe('ADR 0020 test 1 (vehicle half): a vehicle row is seen where its unit is seen', () => {
  it('erp_app adds the vehicle row for a unit in its branch and reads it back', async () => {
    const unit = await addUnit(owner, x, bikeX);
    const engineNo = fresh('EN');
    expect(await addVehicle(app, x, unit, { engineNo })).toBe(1);
    const rows = await inScope(
      app,
      x,
      (tx) =>
        tx.$queryRaw<{ engine: string; colour: string }[]>`
        SELECT engine_no AS engine, colour FROM vehicle_unit WHERE serial_unit_id = ${unit}::uuid`,
    );
    expect(rows).toEqual([{ engine: engineNo, colour: 'Red' }]);
  });

  it("in X, erp_app sees and changes nothing of Y's vehicle rows, even by id, and cannot add one in Y", async () => {
    const unitY = await addUnit(owner, y, bikeY);
    await addVehicle(owner, y, unitY);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT 1 FROM vehicle_unit WHERE serial_unit_id = ${unitY}::uuid`).toEqual(
        [],
      );
      expect(
        await tx.$executeRaw`UPDATE vehicle_unit SET colour = 'Blue' WHERE serial_unit_id = ${unitY}::uuid`,
      ).toBe(0);
    });
    const otherUnitY = await addUnit(owner, y, bikeY);
    await expect(addVehicle(app, x, otherUnitY, { businessId: y.businessId })).rejects.toThrow(
      /row-level security/,
    );
  });

  it('with only branch A in scope, erp_app sees, changes and adds nothing for a unit in branch B', async () => {
    const unitB = await addUnit(owner, x, bikeX, branchB);
    await addVehicle(owner, x, unitB, {}, [branchB]);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT 1 FROM vehicle_unit WHERE serial_unit_id = ${unitB}::uuid`).toEqual(
        [],
      );
      expect(
        await tx.$executeRaw`UPDATE vehicle_unit SET colour = 'Blue' WHERE serial_unit_id = ${unitB}::uuid`,
      ).toBe(0);
    });
    const otherUnitB = await addUnit(owner, x, bikeX, branchB);
    await expect(addVehicle(app, x, otherUnitB)).rejects.toThrow(/row-level security/);
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT 1 FROM vehicle_unit`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('ADR 0020 tests 2 and 4 (vehicle half): what a vehicle row may name', () => {
  it("2. a vehicle row naming another business's unit is refused (composite foreign key)", async () => {
    const unitY = await addUnit(owner, y, bikeY);
    await expect(addVehicle(owner, x, unitY)).rejects.toThrow(/vehicle_unit_business_id_serial_unit_id_fkey/);
  });

  it('a unit has at most one vehicle row', async () => {
    const unit = await addUnit(owner, x, bikeX);
    await addVehicle(owner, x, unit);
    await expect(addVehicle(owner, x, unit)).rejects.toThrow(/vehicle_unit_pkey/);
  });

  it('4. a second engine number in the business is refused; in another business it is accepted', async () => {
    const engineNo = fresh('EN');
    await addVehicle(owner, x, await addUnit(owner, x, bikeX), { engineNo });
    await expect(addVehicle(owner, x, await addUnit(owner, x, bikeX), { engineNo })).rejects.toThrow(
      /vehicle_unit_business_id_engine_no_key/,
    );
    await expect(addVehicle(owner, y, await addUnit(owner, y, bikeY), { engineNo })).resolves.toBe(1);
  });
});

describe('ADR 0020 tests 7 and 8 (vehicle half): rights', () => {
  it('7. erp_app can change the colour', async () => {
    const unit = await addUnit(owner, x, bikeX);
    await addVehicle(owner, x, unit);
    await expect(
      inScope(
        app,
        x,
        (tx) => tx.$executeRaw`UPDATE vehicle_unit SET colour = 'Black' WHERE serial_unit_id = ${unit}::uuid`,
      ),
    ).resolves.toBe(1);
  });

  it.each(['engine_no', 'serial_unit_id', 'business_id', 'created_at'])(
    '7. erp_app cannot UPDATE %s (permission denied)',
    async (column) => {
      await expect(
        inScope(app, x, (tx) =>
          tx.$executeRawUnsafe(`UPDATE vehicle_unit SET ${column} = ${column} WHERE false`),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('8. erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM vehicle_unit WHERE false')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe('TRUNCATE vehicle_unit')).rejects.toThrow(/permission denied/);
  });

  it('8. TRUNCATE is refused for the superuser owner (trigger)', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE vehicle_unit');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on vehicle_unit/);
  });
});

describe('ADR 0020 test 8 (vehicle half): an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;
  let tree: Tree;
  let other: Tree;
  let unit: string;
  let otherUnit: string;

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
    tree = await createTree(db.client);
    other = await createTree(db.client);
    unit = await addUnit(db.client, tree, await addBike(db.client, tree));
    otherUnit = await addUnit(db.client, other, await addBike(db.client, other));
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('inserts and reads a vehicle row inside the business it set', async () => {
    await addVehicle(db.client, tree, unit);
    const seen = await inScope(
      db.client,
      tree,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT serial_unit_id::text AS id FROM vehicle_unit`,
    );
    expect(seen).toEqual([{ id: unit }]);
  });

  it('an insert into a business outside the scope it set is refused by its own policy', async () => {
    await expect(addVehicle(db.client, tree, otherUnit, { businessId: other.businessId })).rejects.toThrow(
      /row-level security/,
    );
  });

  it('with no app.* values set, reading fails with "tenant scope not set"', async () => {
    await expect(db.client.$queryRaw`SELECT 1 FROM vehicle_unit`).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows and the rows remain; a TRUNCATE is refused', async () => {
    const result = await inScope(db.client, tree, async (tx) => ({
      deleted: await tx.$executeRawUnsafe('DELETE FROM vehicle_unit'),
      left: (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM vehicle_unit`)[0]?.n,
    }));
    expect(result).toEqual({ deleted: 0, left: 1 });
    await expect(db.client.$executeRawUnsafe('TRUNCATE vehicle_unit')).rejects.toThrow(
      /TRUNCATE is refused on vehicle_unit/,
    );
  });
});
