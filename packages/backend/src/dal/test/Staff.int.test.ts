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
 * Migration staff (ADR 0009 part 4, ADR 0008 sections 2 and 4): people of a business, with or without a login.
 * ADR 0008 tests 1 and 2 for staff, and 14 (a staff row with no branch is visible to every scope of its business;
 * a branch 1 row is not visible to a branch 2-only scope). Fixtures are written as the owner inside their scope.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let branch2: string;
let y: Tree;

function inScope<T>(db: DbClient, tree: Tree, branchIds: string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

/** A staff row in the tree's business; `branchId` null is business-level. Returns its id. */
async function addStaff(
  db: DbClient,
  tree: Tree,
  branchId: string | null,
  scope?: string[],
): Promise<string> {
  return inScope(db, tree, scope ?? (branchId ? [branchId] : [tree.branchId]), async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO staff (business_id, branch_id, name, designation)
      VALUES (${tree.businessId}::uuid, ${branchId}::uuid, 'Test Staff', 'Technician')
      RETURNING id::text`;
    if (!row) throw new Error('the insert returned no row');
    return row.id;
  });
}

const visible = (tree: Tree, branchIds: string[], id: string) =>
  inScope(
    app,
    tree,
    branchIds,
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM staff WHERE id = ${id}::uuid`,
  );

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  branch2 = await addBranch(owner, x.organizationId, x.businessId, 'STB');
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'staff')).toEqual([{ enabled: true, forced: true }]);
  });

  it('every policy names its role (erp_app or the migration owner); there is no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'staff');
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

  it('erp_app holds SELECT and INSERT, and UPDATE on name, phone, designation, is_active, version, updated_at', async () => {
    expect(await tablePrivileges(owner, 'staff', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'staff' AND grantee = 'erp_app' AND privilege_type = 'UPDATE' ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual([
      'designation',
      'is_active',
      'name',
      'phone',
      'updated_at',
      'version',
    ]);
  });

  it('a BEFORE TRUNCATE trigger refuses TRUNCATE for every role', async () => {
    expect(await truncateRefusers(owner, 'staff')).toEqual(['staff_no_truncate']);
  });

  it('dal/sql/rls/staff.sql appears, unchanged, in the staff migration', () => {
    expect(sourceIsInMigration('sql/rls/staff.sql', 'staff')).toBe(true);
  });
});

describe('ADR 0008 test 14: business-level staff are seen by every scope of the business', () => {
  it('a staff row with no branch is visible to a branch 2-only scope', async () => {
    const id = await addStaff(owner, x, null);
    expect(await visible(x, [branch2], id)).toEqual([{ id }]);
  });

  it('a staff row of branch 1 is not visible to a branch 2-only scope, and is to branch 1', async () => {
    const id = await addStaff(owner, x, x.branchId);
    expect(await visible(x, [branch2], id)).toEqual([]);
    expect(await visible(x, [x.branchId], id)).toEqual([{ id }]);
  });

  it('erp_app creates business-level and branch staff in its scope, and none in a branch outside it', async () => {
    await expect(addStaff(app, x, null)).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expect(addStaff(app, x, x.branchId)).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expect(addStaff(app, x, branch2, [x.branchId])).rejects.toThrow(/row-level security/);
  });
});

describe('ADR 0008 tests 1 and 2: isolation', () => {
  it("1. in business X's scope, erp_app sees, changes and guesses nothing of Y's staff", async () => {
    const idY = await addStaff(owner, y, null);
    await inScope(app, x, [x.branchId], async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM staff WHERE id = ${idY}::uuid`).toEqual([]);
      expect(await tx.$executeRaw`UPDATE staff SET name = 'X' WHERE id = ${idY}::uuid`).toBe(0);
    });
    await expect(
      inScope(
        app,
        x,
        [x.branchId],
        (tx) =>
          tx.$executeRaw`INSERT INTO staff (business_id, name) VALUES (${y.businessId}::uuid, 'Into Y')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("2. a scope of organization B sees nothing of organization A's staff, even business-level rows", async () => {
    const idX = await addStaff(owner, x, null);
    expect(await visible(y, [y.branchId], idX)).toEqual([]);
  });

  it("a staff row cannot name another business's branch (composite foreign key)", async () => {
    await expect(addStaff(owner, x, y.branchId, [x.branchId, y.branchId])).rejects.toThrow(
      /staff_business_id_branch_id_fkey/,
    );
  });

  it('nothing is added to a deactivated branch (branch_is_active)', async () => {
    const closed = await addBranch(owner, x.organizationId, x.businessId, 'STC');
    await owner.$executeRaw`UPDATE branch SET is_active = false WHERE id = ${closed}::uuid`;
    await expect(addStaff(app, x, closed)).rejects.toThrow(/row-level security/);
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM staff`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('rights', () => {
  it('erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM staff WHERE false')).rejects.toThrow(/permission denied/);
    await expect(app.$executeRawUnsafe('TRUNCATE staff')).rejects.toThrow(/permission denied/);
  });

  it.each(['business_id', 'branch_id', 'user_id', 'created_at', 'created_by'])(
    'erp_app cannot UPDATE %s (permission denied)',
    async (column) => {
      await expect(
        inScope(app, x, [x.branchId], (tx) =>
          tx.$executeRawUnsafe(`UPDATE staff SET ${column} = ${column} WHERE false`),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('TRUNCATE is refused for the superuser owner (trigger)', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE staff');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on staff|cannot truncate a table referenced/);
  });
});

describe('the owner path, for an owner that is neither superuser nor BYPASSRLS', () => {
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

  it('inserts and reads staff inside the business it set, and sees no other business', async () => {
    const mine = await addStaff(db.client, tree, null);
    await addStaff(db.client, other, null);
    const seen = await inScope(
      db.client,
      tree,
      [tree.branchId],
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM staff`,
    );
    expect(seen).toEqual([{ id: mine }]);
  });

  it('an insert into a business outside the scope it set is refused by its own policy', async () => {
    await expect(
      inScope(
        db.client,
        tree,
        [tree.branchId],
        (tx) =>
          tx.$executeRaw`INSERT INTO staff (business_id, name) VALUES (${other.businessId}::uuid, 'Outside')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a DELETE removes 0 rows and the rows remain; a TRUNCATE is refused', async () => {
    const result = await inScope(db.client, tree, [tree.branchId], async (tx) => ({
      deleted: await tx.$executeRawUnsafe('DELETE FROM staff'),
      left: (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM staff`)[0]?.n,
    }));
    expect(result.deleted).toBe(0);
    expect(result.left).toBeGreaterThan(0);
    await expect(db.client.$executeRawUnsafe('TRUNCATE staff')).rejects.toThrow(
      /TRUNCATE is refused on staff/,
    );
  });
});
