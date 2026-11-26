import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { addBranch, createTree, newIds, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration stock_ledger (ADR 0021 part 1 as amended by ADR 0054): location, stock_movement, stock_balance and
 * stock_cost, tested in SQL. ADR 0021 tests 1, 6 to 9 and 11; ADR 0054 tests 13 to 17; tenancy on every table
 * (Munif, 24 Nov). Concurrency, cost and deadlock tests (ADR 0021 tests 2 to 5 and 10) come with StockService.
 * Fixtures are written as the migration owner inside the scope they set; nothing is deleted (fresh ids).
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
/** One connection only, so the pooled-connection test reuses the same session. */
const appSingle: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 15_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];
const TABLES = ['location', 'stock_movement', 'stock_balance', 'stock_cost'] as const;

let x: Tree;
let y: Tree;
let branchB: string;
let partX: string;
let bikeX: string;
let partY: string;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>, branchIds = [tree.branchId]) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

async function addProduct(tree: Tree, tracking: 'serial' | 'quantity'): Promise<string> {
  return inScope(owner, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${tree.businessId}::uuid, ${`P-${randomBytes(5).toString('hex')}`}, 'Test product', 'pcs', ${tracking},
              1000.00)
      RETURNING id::text`;
    if (!row) throw new Error('no product row');
    return row.id;
  });
}

async function addUnit(tree: Tree, productId: string): Promise<string> {
  return inScope(owner, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
      VALUES (${tree.businessId}::uuid, ${tree.branchId}::uuid, ${productId}::uuid,
              ${`CH-${randomBytes(5).toString('hex')}`}, 150000.00)
      RETURNING id::text`;
    if (!row) throw new Error('no unit row');
    return row.id;
  });
}

/** The branch's one location, read as the owner in scope. */
async function locationOf(tree: Tree, branchId = tree.branchId): Promise<string[]> {
  return inScope(
    owner,
    tree,
    async (tx) =>
      (
        await tx.$queryRaw<
          { id: string }[]
        >`SELECT id::text FROM location WHERE branch_id = ${branchId}::uuid`
      ).map((r) => r.id),
    [tree.branchId, branchId],
  );
}

interface Move {
  branchId?: string;
  locationId?: string;
  productId?: string;
  serialUnitId?: string | null;
  qtyDelta?: string;
  kind?: string;
  sourceType?: string;
  sourceId?: string;
}

/** Inserts one movement on `db` in the tree's scope. Returns its id. */
async function addMove(db: DbClient, tree: Tree, move: Move = {}, branchIds?: string[]): Promise<string> {
  const branchId = move.branchId ?? tree.branchId;
  const locationId = move.locationId ?? (await locationOf(tree, branchId))[0];
  return inScope(
    db,
    tree,
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO stock_movement (business_id, branch_id, location_id, product_id, serial_unit_id, qty_delta,
                                    unit_cost, kind, source_type, source_id, movement_date)
        VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${locationId}::uuid, ${move.productId ?? partX}::uuid,
                ${move.serialUnitId ?? null}::uuid, ${move.qtyDelta ?? '5'}::numeric, 100.00, ${move.kind ?? 'receipt'},
                ${move.sourceType ?? 'test'}, ${move.sourceId ?? randomUUID()}::uuid, CURRENT_DATE)
        RETURNING id::text`;
      if (!row) throw new Error('no movement row');
      return row.id;
    },
    branchIds ?? [tree.branchId, branchId],
  );
}

/** A balance row and a cost row for (branch, product), as the owner. */
async function addBalance(tree: Tree, productId: string, onHand = '5'): Promise<void> {
  const [locationId] = await locationOf(tree);
  await inScope(owner, tree, async (tx) => {
    await tx.$executeRaw`
      INSERT INTO stock_balance (business_id, branch_id, location_id, product_id, on_hand)
      VALUES (${tree.businessId}::uuid, ${tree.branchId}::uuid, ${locationId}::uuid, ${productId}::uuid,
              ${onHand}::numeric)`;
    await tx.$executeRaw`
      INSERT INTO stock_cost (business_id, branch_id, product_id, avg_cost)
      VALUES (${tree.businessId}::uuid, ${tree.branchId}::uuid, ${productId}::uuid, 100.00)`;
  });
}

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'BRB');
  [partX, bikeX, partY] = await Promise.all([
    addProduct(x, 'quantity'),
    addProduct(x, 'serial'),
    addProduct(y, 'quantity'),
  ]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), appSingle.$disconnect()]);
});

describe('the four tables follow the tenant-table rules', () => {
  it.each(TABLES)(
    '%s: RLS enabled and forced; no DELETE or ALL policy; TRUNCATE refused by a trigger',
    async (t) => {
      expect(await rlsState(owner, t)).toEqual([{ enabled: true, forced: true }]);
      const rows = await policies(owner, t);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((p) => p.cmd !== 'DELETE' && p.cmd !== 'ALL')).toBe(true);
      expect(await truncateRefusers(owner, t)).toEqual([`${t}_no_truncate`]);
    },
  );

  it('erp_app: SELECT only on location; SELECT and INSERT on movements; INSERT and column UPDATE on the caches', async () => {
    expect(await tablePrivileges(owner, 'location', 'erp_app')).toEqual(['SELECT']);
    expect(await tablePrivileges(owner, 'stock_movement', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    expect(await tablePrivileges(owner, 'stock_balance', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    expect(await tablePrivileges(owner, 'stock_cost', 'erp_app')).toEqual(['INSERT', 'SELECT']);
  });

  it('dal/sql/rls/stock_ledger.sql appears, unchanged, in the stock_ledger migration', () => {
    expect(sourceIsInMigration('sql/rls/stock_ledger.sql', 'stock_ledger')).toBe(true);
  });
});

describe('ADR 0054 test 13: one location per branch, created with the branch', () => {
  it('a new branch gets exactly one sales_floor location, the default for sales, in the same transaction', async () => {
    const branch = await addBranch(owner, x.organizationId, x.businessId, 'NEW');
    const rows = await inScope(
      owner,
      x,
      (tx) => tx.$queryRaw<{ kind: string; is_default_sale: boolean }[]>`
        SELECT kind, is_default_sale FROM location WHERE branch_id = ${branch}::uuid`,
      [branch],
    );
    expect(rows).toEqual([{ kind: 'sales_floor', is_default_sale: true }]);
  });

  it('a branch whose insert rolls back leaves no location behind', async () => {
    const [id] = await owner.$transaction((tx) => newIds(tx, 1));
    await expect(
      owner.$transaction(async (tx) => {
        await setScope(tx, x.organizationId, [x.businessId], [id ?? '']);
        await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
          VALUES (${id}::uuid, ${x.businessId}::uuid, 'Rolled back', 'RBK')`;
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await locationOf(x, id)).toEqual([]);
  });

  it('a second location in the branch, another kind, or one with no branch is refused', async () => {
    const insert = (branchId: string | null, kind: string, isDefault: boolean) =>
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`
        INSERT INTO location (business_id, branch_id, kind, is_default_sale)
        VALUES (${x.businessId}::uuid, ${branchId}::uuid, ${kind}, ${isDefault})`,
      );
    await expect(insert(x.branchId, 'sales_floor', true)).rejects.toThrow(/unique|duplicate/i);
    await expect(insert(x.branchId, 'storage', false)).rejects.toThrow(/check|violates/i);
    await expect(insert(null, 'sales_floor', true)).rejects.toThrow(/null/i);
  });

  it('the backfill gives every existing branch without one its location, and running it again adds nothing', async () => {
    // A branch made while the trigger is off stands for a branch that existed before the migration.
    const branch = await owner.$transaction(async (tx) => {
      const [id] = (await newIds(tx, 1)) as [string];
      await tx.$executeRawUnsafe('ALTER TABLE branch DISABLE TRIGGER branch_default_location');
      await setScope(tx, x.organizationId, [x.businessId], [id]);
      await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
        VALUES (${id}::uuid, ${x.businessId}::uuid, 'Before the migration', 'OLD')`;
      await tx.$executeRawUnsafe('ALTER TABLE branch ENABLE TRIGGER branch_default_location');
      return id;
    });
    expect(await locationOf(x, branch)).toEqual([]);
    await owner.$executeRawUnsafe('SELECT public.stock_location_backfill()');
    await owner.$executeRawUnsafe('SELECT public.stock_location_backfill()');
    expect(await locationOf(x, branch)).toHaveLength(1);
  });
});

describe('ADR 0054 test 14 and ADR 0021 test 8: what a row may name', () => {
  it("a movement naming another branch's location is refused (composite key)", async () => {
    const [locationB] = await locationOf(x, branchB);
    await expect(addMove(owner, x, { locationId: locationB })).rejects.toThrow(/foreign key/i);
  });

  it("a movement naming another business's product, branch or unit is refused", async () => {
    await expect(addMove(owner, x, { productId: partY })).rejects.toThrow(/foreign key/i);
    await expect(
      addMove(owner, x, { branchId: y.branchId, locationId: (await locationOf(y))[0] }, [
        x.branchId,
        y.branchId,
      ]),
    ).rejects.toThrow(/foreign key|row-level security/i);
    const unitY = await addUnit(y, await addProduct(y, 'serial'));
    await expect(addMove(owner, x, { productId: bikeX, serialUnitId: unitY, qtyDelta: '1' })).rejects.toThrow(
      /foreign key/i,
    );
  });
});

describe('ADR 0054 test 15 and ADR 0021 test 9: the CHECK rules', () => {
  it('kinds are opening, receipt, sale and adjustment only: transfer, relocation and sale_return are refused', async () => {
    for (const kind of ['opening', 'receipt', 'adjustment'])
      await expect(addMove(owner, x, { kind })).resolves.toBeTruthy();
    for (const kind of ['transfer', 'relocation', 'sale_return'])
      await expect(addMove(owner, x, { kind })).rejects.toThrow(/check/i);
  });

  it('a movement with no branch is refused (no In transit)', async () => {
    const [locationId] = await locationOf(x);
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`
        INSERT INTO stock_movement (business_id, branch_id, location_id, product_id, qty_delta, unit_cost, kind,
                                    source_type, source_id, movement_date)
        VALUES (${x.businessId}::uuid, NULL, ${locationId}::uuid, ${partX}::uuid, 5, 100.00, 'receipt', 'test',
                ${randomUUID()}::uuid, CURRENT_DATE)`,
      ),
    ).rejects.toThrow(/null/i);
  });

  it('a zero quantity, and a serial movement of 2, are refused', async () => {
    await expect(addMove(owner, x, { qtyDelta: '0' })).rejects.toThrow(/check/i);
    const unit = await addUnit(x, bikeX);
    await expect(addMove(owner, x, { productId: bikeX, serialUnitId: unit, qtyDelta: '2' })).rejects.toThrow(
      /check/i,
    );
    await expect(
      addMove(owner, x, { productId: bikeX, serialUnitId: unit, qtyDelta: '1' }),
    ).resolves.toBeTruthy();
  });

  it('one movement per source line: the same source, product and unit twice is refused', async () => {
    const sourceId = randomUUID();
    await addMove(owner, x, { sourceType: 'invoice', sourceId });
    await expect(addMove(owner, x, { sourceType: 'invoice', sourceId })).rejects.toThrow(/unique|duplicate/i);
  });

  it('a balance below zero is refused by the database (F-08)', async () => {
    const part = await addProduct(x, 'quantity');
    await expect(addBalance(x, part, '-1')).rejects.toThrow(/check/i);
  });
});

describe('ADR 0021 tests 6 and 7: posted is permanent', () => {
  it('erp_app cannot update or delete a movement (no grant)', async () => {
    const id = await addMove(owner, x);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`UPDATE stock_movement SET qty_delta = 9 WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`DELETE FROM stock_movement WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the owner cannot update or delete one either: the trigger refuses for every role', async () => {
    const id = await addMove(owner, x);
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE stock_movement SET qty_delta = 9 WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      inScope(owner, x, (tx) => tx.$executeRaw`DELETE FROM stock_movement WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/append-only/i);
  });

  it.each(TABLES)('TRUNCATE %s is refused for the owner, even with CASCADE', async (t) => {
    await expect(owner.$executeRawUnsafe(`TRUNCATE ${t} CASCADE`)).rejects.toThrow(
      /refuse|not allowed|truncate/i,
    );
  });
});

describe('tenancy on every stock table (Munif, 24 Nov)', () => {
  let moveY: string;
  beforeAll(async () => {
    moveY = await addMove(owner, y, { productId: partY });
    await addBalance(y, partY);
  });

  it.each(TABLES)("in X, erp_app reads nothing of Y's %s rows, even by id", async (t) => {
    // Only Y's rows: the owner may bypass RLS (a superuser in dev), so filter on Y's business explicitly.
    const ids = await inScope(owner, y, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM ${t} WHERE business_id = $1::uuid`,
        y.businessId,
      ),
    );
    expect(ids.length).toBeGreaterThan(0);
    const seen = await inScope(app, x, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM ${t} WHERE id = ANY($1::uuid[])`,
        ids.map((r) => r.id),
      ),
    );
    expect(seen).toEqual([]);
  });

  it("in X, erp_app can't write Y's movement or balance, or change Y's balance by guessing its id", async () => {
    await expect(addMove(app, x, { productId: partY })).rejects.toThrow(/foreign key|row-level security/i);
    const changed = await inScope(
      app,
      x,
      (tx) => tx.$executeRaw`
      UPDATE stock_balance SET on_hand = on_hand + 1 WHERE product_id = ${partY}::uuid`,
    );
    expect(changed).toBe(0);
    expect(moveY).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('with only branch A in scope, erp_app sees nothing of branch B and writes nothing there', async () => {
    const moveB = await addMove(owner, x, { branchId: branchB }, [x.branchId, branchB]);
    const seen = await inScope(
      app,
      x,
      (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM stock_movement WHERE id = ${moveB}::uuid`,
    );
    expect(seen).toEqual([]);
    await expect(addMove(app, x, { branchId: branchB }, [x.branchId])).rejects.toThrow(/row-level security/i);
  });

  it('a pooled connection returns nothing until the tenant settings are set again', async () => {
    const id = await addMove(owner, x);
    const inside = await inScope(
      appSingle,
      x,
      (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM stock_movement WHERE id = ${id}::uuid`,
    );
    expect(inside).toHaveLength(1);
    // The same single connection, in a new transaction with no SET LOCAL: the settings are gone.
    await expect(
      appSingle.$transaction((tx) => tx.$queryRaw`SELECT id FROM stock_movement WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/tenant scope not set/);
  });
});

describe('ADR 0021 tests 1 and 11, ADR 0054 test 16: the balance is a cache of the movements', () => {
  it('rebuildStockBalance() recomputes every branch balance from the movements, per branch', async () => {
    const part = await addProduct(x, 'quantity');
    await addMove(owner, x, { productId: part, qtyDelta: '10' });
    await addMove(owner, x, { productId: part, qtyDelta: '-3', kind: 'sale' });
    await addMove(owner, x, { productId: part, qtyDelta: '4', branchId: branchB }, [x.branchId, branchB]);
    await owner.$executeRawUnsafe('SELECT public.rebuild_stock_balance()');
    const rows = await inScope(
      owner,
      x,
      (tx) => tx.$queryRaw<{ branch_id: string; on_hand: string }[]>`
        SELECT branch_id::text, on_hand::text FROM stock_balance WHERE product_id = ${part}::uuid ORDER BY on_hand`,
      [x.branchId, branchB],
    );
    expect(rows).toEqual([
      { branch_id: branchB, on_hand: '4.000' },
      { branch_id: x.branchId, on_hand: '7.000' },
    ]);
  });

  it('erp_app cannot run rebuild_stock_balance(): it is the owner’s, never reachable from a request', async () => {
    await expect(
      inScope(app, x, (tx) => tx.$queryRawUnsafe('SELECT public.rebuild_stock_balance()')),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('ADR 0054 test 17: nothing that would block transfers later', () => {
  it('source_type and source_id exist on movements; avg_cost lives only on stock_cost; every location_id is NOT NULL', async () => {
    const cols = await owner.$queryRaw<{ table_name: string; column_name: string; is_nullable: string }[]>`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('stock_movement', 'stock_balance', 'stock_cost')`;
    const has = (t: string, c: string) => cols.find((r) => r.table_name === t && r.column_name === c);
    expect(has('stock_movement', 'source_type')).toBeTruthy();
    expect(has('stock_movement', 'source_id')).toBeTruthy();
    expect(has('stock_cost', 'avg_cost')).toBeTruthy();
    expect(has('stock_balance', 'avg_cost')).toBeUndefined();
    expect(has('stock_movement', 'location_id')?.is_nullable).toBe('NO');
    expect(has('stock_balance', 'location_id')?.is_nullable).toBe('NO');
  });
});
