import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';
import { policies, rlsState, sourceIsInMigration, tablePrivileges } from './support/tableRules.js';

/**
 * Migration number_series (ADR 0015 sections 1 to 3): the table's rules, tested in SQL. ADR 0015 tests 1 to 5, 7 and
 * 9 at the database level; the "no series" 409 (test 6) and the formatting (tests 8, 10) belong to
 * NumberSeriesQuery and NumberSeries. Each test uses its own kind, so series never collide between tests.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 10, txTimeoutMs: 15_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let branchB: string;
let y: Tree;

const freshKind = () => `k_${randomBytes(6).toString('hex')}`;

/**
 * Runs fn on `db` inside the tree's business and the given branches (default: the tree's branch). A tenant scope
 * always has at least one branch (tenantScopeSchema), so a business-wide take runs with a branch in scope too.
 */
function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>, branchIds = [tree.branchId]) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

/** Creates a series as the owner. `branchId` null is a business-wide series. Returns its id. */
async function addSeries(tree: Tree, branchId: string | null, kind: string, nextValue = 1): Promise<string> {
  return inScope(
    owner,
    tree,
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO number_series (business_id, branch_id, kind, prefix, next_value)
        VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${kind}, 'T-', ${nextValue})
        RETURNING id::text`;
      if (!row) throw new Error('the insert returned no row');
      return row.id;
    },
    branchId ? [branchId] : [tree.branchId],
  );
}

/** ADR 0015 section 2: one atomic UPDATE; the branch and business-wide statements differ. Returns the value taken. */
async function take(
  tx: Tx,
  businessId: string,
  branchId: string | null,
  kind: string,
): Promise<number | null> {
  const rows = branchId
    ? await tx.$queryRaw<{ value: number }[]>`
        UPDATE number_series SET next_value = next_value + 1
        WHERE business_id = ${businessId}::uuid AND branch_id = ${branchId}::uuid AND kind = ${kind}
        RETURNING (next_value - 1)::int AS value`
    : await tx.$queryRaw<{ value: number }[]>`
        UPDATE number_series SET next_value = next_value + 1
        WHERE business_id = ${businessId}::uuid AND branch_id IS NULL AND kind = ${kind}
        RETURNING (next_value - 1)::int AS value`;
  return rows[0]?.value ?? null;
}

/** Takes a number as erp_app in its own committed transaction. */
const takeAsApp = (tree: Tree, branchId: string | null, kind: string, branchIds = [tree.branchId]) =>
  inScope(app, tree, (tx) => take(tx, tree.businessId, branchId, kind), branchIds);

/**
 * Holds one take open in a transaction while `second` runs. Reports whether `second` was still waiting after
 * 500 ms, then lets the first finish (commit, or roll back when `rollback` is set) and returns both values.
 */
async function holdWhile(
  tree: Tree,
  branchId: string | null,
  kind: string,
  second: () => Promise<number | null>,
  rollback = false,
): Promise<{ first: number | null; secondWaited: boolean; second: number | null }> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let taken!: (value: number | null) => void;
  const firstTaken = new Promise<number | null>((resolve) => (taken = resolve));
  const first = inScope(
    app,
    tree,
    async (tx) => {
      taken(await take(tx, tree.businessId, branchId, kind));
      await held;
      if (rollback) throw new Error('rolled back on purpose');
    },
    branchId ? [branchId] : [tree.branchId],
  ).catch((error: unknown) => {
    if (!rollback) throw error;
  });
  const firstValue = await firstTaken;
  let settled = false;
  const secondRun = second().finally(() => (settled = true));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const secondWaited = !settled;
  release();
  await first;
  return { first: firstValue, secondWaited, second: await secondRun };
}

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'UTB');
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'number_series')).toEqual([{ enabled: true, forced: true }]);
  });

  it('every policy names its role (erp_app or the migration owner); there is no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'number_series');
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

  it('erp_app holds SELECT and INSERT on the table, and UPDATE on next_value only', async () => {
    expect(await tablePrivileges(owner, 'number_series', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'number_series' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'`;
    expect(columns.map((row) => row.column)).toEqual(['next_value']);
  });

  it('the unique index on (business_id, branch_id, kind) is NULLS NOT DISTINCT', async () => {
    const rows = await owner.$queryRaw<{ unique: boolean; nullsNotDistinct: boolean }[]>`
      SELECT i.indisunique AS unique, i.indnullsnotdistinct AS "nullsNotDistinct"
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = 'number_series_business_id_branch_id_kind_key'`;
    expect(rows).toEqual([{ unique: true, nullsNotDistinct: true }]);
  });

  it('dal/sql/rls/number_series.sql appears, unchanged, in the number_series migration', () => {
    expect(sourceIsInMigration('sql/rls/number_series.sql', 'number_series')).toBe(true);
  });
});

describe('ADR 0015 section 2: taking numbers', () => {
  it('1. two parallel takes in one branch: the second waits, then gets the next number', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    const result = await holdWhile(x, x.branchId, kind, () => takeAsApp(x, x.branchId, kind));
    expect(result).toEqual({ first: 1, secondWaited: true, second: 2 });
  });

  it('2. a take that rolls back leaves no gap: the waiting take gets the same value', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    const result = await holdWhile(x, x.branchId, kind, () => takeAsApp(x, x.branchId, kind), true);
    expect(result).toEqual({ first: 1, secondWaited: true, second: 1 });
    expect(await takeAsApp(x, x.branchId, kind)).toBe(2);
  });

  it('3. two branches number independently; neither waits on the other', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    await addSeries(x, branchB, kind);
    const result = await holdWhile(x, x.branchId, kind, () => takeAsApp(x, branchB, kind, [branchB]));
    expect(result).toEqual({ first: 1, secondWaited: false, second: 1 });
  });

  it('6. with no series for the kind, the take updates nothing (the Query turns that into a 409)', async () => {
    expect(await takeAsApp(x, x.branchId, freshKind())).toBeNull();
  });

  it('7. fifty parallel takes in one branch give exactly 1 to 50', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    const values = await Promise.all(Array.from({ length: 50 }, () => takeAsApp(x, x.branchId, kind)));
    expect([...values].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });
});

describe('ADR 0015 test 9: business-wide series (branch null)', () => {
  it('two parallel takes give consecutive numbers', async () => {
    const kind = freshKind();
    await addSeries(x, null, kind);
    const result = await holdWhile(x, null, kind, () => takeAsApp(x, null, kind));
    expect(result).toEqual({ first: 1, secondWaited: true, second: 2 });
  });

  it('a second business-wide row for the same kind is refused (NULLS NOT DISTINCT)', async () => {
    const kind = freshKind();
    await addSeries(x, null, kind);
    await expect(addSeries(x, null, kind)).rejects.toThrow(/number_series_business_id_branch_id_kind_key/);
  });

  it("the same kind business-wide in Y is independent of X's", async () => {
    const kind = freshKind();
    await addSeries(x, null, kind, 40);
    await addSeries(y, null, kind);
    expect(await takeAsApp(x, null, kind)).toBe(40);
    expect(await takeAsApp(y, null, kind)).toBe(1);
  });

  it("a business-wide take never touches a branch's series of the same kind", async () => {
    const kind = freshKind();
    await addSeries(x, null, kind);
    await addSeries(x, x.branchId, kind, 7);
    expect(await takeAsApp(x, null, kind)).toBe(1);
    expect(await takeAsApp(x, x.branchId, kind)).toBe(7);
  });
});

describe('ADR 0015 test 4: tenant isolation', () => {
  it("in X, erp_app cannot read or take Y's series, even by id, and cannot create one in Y", async () => {
    const kind = freshKind();
    const idY = await addSeries(y, y.branchId, kind);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM number_series WHERE id = ${idY}::uuid`).toEqual([]);
      expect(
        await tx.$executeRaw`UPDATE number_series SET next_value = next_value + 1 WHERE id = ${idY}::uuid`,
      ).toBe(0);
    });
    await expect(
      inScope(
        app,
        x,
        (tx) =>
          tx.$executeRaw`
          INSERT INTO number_series (business_id, branch_id, kind, prefix)
          VALUES (${y.businessId}::uuid, NULL, ${kind}, 'Y-')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("with only branch A in scope, erp_app sees and takes nothing of branch B's series", async () => {
    const kind = freshKind();
    const idB = await addSeries(x, branchB, kind);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM number_series WHERE id = ${idB}::uuid`).toEqual([]);
      expect(await take(tx, x.businessId, branchB, kind)).toBeNull();
    });
  });

  it("a series cannot name another business's branch (composite foreign key)", async () => {
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO number_series (business_id, branch_id, kind, prefix)
          VALUES (${x.businessId}::uuid, ${y.branchId}::uuid, ${freshKind()}, 'Z-')`,
      ),
    ).rejects.toThrow(/number_series_business_id_branch_id_fkey/);
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM number_series`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('ADR 0015 test 5: erp_app rights and the +1 trigger', () => {
  it('erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM number_series WHERE false')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe('TRUNCATE number_series')).rejects.toThrow(/permission denied/);
  });

  it.each(['prefix', 'width', 'kind', 'branch_id', 'business_id'])(
    'erp_app cannot UPDATE %s',
    async (column) => {
      await expect(
        inScope(app, x, (tx) =>
          tx.$executeRawUnsafe(`UPDATE number_series SET ${column} = ${column} WHERE false`),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it.each(['next_value + 2', 'next_value - 1', 'next_value', '1'])(
    'next_value = %s is refused by the trigger, for erp_app',
    async (expression) => {
      const kind = freshKind();
      const id = await addSeries(x, x.branchId, kind, 5);
      await expect(
        inScope(app, x, (tx) =>
          tx.$executeRawUnsafe(
            `UPDATE number_series SET next_value = ${expression} WHERE id = '${id}'::uuid`,
          ),
        ),
      ).rejects.toThrow(/next_value moves only by \+1/);
    },
  );

  it('the owner cannot jump the counter or change the prefix either (the trigger holds for every role)', async () => {
    const id = await addSeries(x, x.branchId, freshKind());
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE number_series SET next_value = 100 WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/next_value moves only by \+1/);
    await expect(
      inScope(
        owner,
        x,
        (tx) =>
          tx.$executeRaw`UPDATE number_series SET next_value = next_value + 1, prefix = 'NEW-' WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/only next_value changes after insert/);
  });
});

describe('constraints and TRUNCATE', () => {
  it('next_value below 1 is refused', async () => {
    await expect(addSeries(x, x.branchId, freshKind(), 0)).rejects.toThrow(
      /number_series_next_value_positive/,
    );
  });

  it.each([0, 19])('width %i is refused (1 to 18)', async (width) => {
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO number_series (business_id, branch_id, kind, prefix, width)
          VALUES (${x.businessId}::uuid, ${x.branchId}::uuid, ${freshKind()}, 'W-', ${width})`,
      ),
    ).rejects.toThrow(/number_series_width_range/);
  });

  it('TRUNCATE is refused for the superuser owner (trigger)', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE number_series');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on number_series/);
  });
});

describe('the owner path, for an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;
  let tree: Tree;
  let other: Tree;

  const insertIn = (scope: Tree, target: Tree) =>
    inScope(
      db.client,
      scope,
      (tx) => tx.$executeRaw`
        INSERT INTO number_series (business_id, branch_id, kind, prefix)
        VALUES (${target.businessId}::uuid, ${target.branchId}::uuid, ${freshKind()}, 'O-')`,
    );

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
    tree = await createTree(db.client);
    other = await createTree(db.client);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('inserts and reads a series inside the business it set, and sees no other business', async () => {
    await insertIn(tree, tree);
    await insertIn(other, other);
    const seen = await inScope(
      db.client,
      tree,
      (tx) =>
        tx.$queryRaw<
          { business: string }[]
        >`SELECT DISTINCT business_id::text AS business FROM number_series`,
    );
    expect(seen).toEqual([{ business: tree.businessId }]);
  });

  it('an insert into a business outside the scope it set is refused by its own policy', async () => {
    await expect(insertIn(tree, other)).rejects.toThrow(/row-level security/);
  });

  it('with no app.* values set, reading fails with "tenant scope not set"', async () => {
    await expect(db.client.$queryRaw`SELECT id FROM number_series`).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows (no owner DELETE policy) and a TRUNCATE is refused', async () => {
    const deleted = await inScope(db.client, tree, (tx) => tx.$executeRawUnsafe('DELETE FROM number_series'));
    expect(deleted).toBe(0);
    const [{ left }] = (await inScope(
      db.client,
      tree,
      (tx) => tx.$queryRaw<{ left: number }[]>`SELECT count(*)::int AS left FROM number_series`,
    )) as [{ left: number }];
    expect(left).toBeGreaterThan(0);
    await expect(db.client.$executeRawUnsafe('TRUNCATE number_series')).rejects.toThrow(
      /TRUNCATE is refused on number_series/,
    );
  });
});
