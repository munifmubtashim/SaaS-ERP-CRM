import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { StockQuery } from '../query/StockQuery.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';

/**
 * StockQuery (ADR 0021 sections 2 and 3 as amended by ADR 0054), as erp_app inside the request's tenant
 * transaction: the branch's one location, stock in under row locks, stock out by one atomic conditional UPDATE
 * (invariant 6) that refuses to go below zero (F-08), and on hand per branch equal to the movements (test 1, 16).
 * StockService (1b) puts these together; its concurrency and cost tests live with it.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
const query = new StockQuery();

let x: Tree;
let branchB: string;

function asApp<T>(fn: () => Promise<T>, branchIds = [x.branchId]): Promise<T> {
  return runInTenantScope(
    app,
    { organizationId: x.organizationId, businessIds: [x.businessId], branchIds, branchId: branchIds[0] },
    fn,
  );
}

async function addPart(): Promise<string> {
  return owner.$transaction(async (tx) => {
    await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${x.businessId}::uuid, ${`P-${randomBytes(5).toString('hex')}`}, 'Brake pad set', 'pcs', 'quantity',
              1000.00)
      RETURNING id::text`;
    if (!row) throw new Error('no product row');
    return row.id;
  });
}

/** Stock in through the query, the way StockService will: lock, apply, record. */
async function receive(branchId: string, productId: string, qty: string, unitCost: string, avgCost: string) {
  const { locationId } = await query.lockForIn(branchId, productId);
  await query.addIn(branchId, productId, locationId, qty);
  await query.setCost(branchId, productId, avgCost);
  return query.insertMovement({
    branchId,
    productId,
    serialUnitId: null,
    qtyDelta: qty,
    unitCost,
    kind: 'receipt',
    reason: null,
    sourceType: 'test_receipt',
    sourceId: randomUUID(),
    movementDate: '2026-11-24',
  });
}

/** The movements' sum for (branch, product), read as erp_app. */
function movementSum(branchId: string, productId: string): Promise<string> {
  return asApp(() => query.movementSum(branchId, productId), [x.branchId, branchId]);
}

beforeAll(async () => {
  x = await createTree(owner);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'BRB');
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the branch’s one location', () => {
  it('defaultLocation is the branch’s sales_floor location', async () => {
    const id = await asApp(() => query.defaultLocation(x.branchId));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a branch outside the scope has no location the query can see', async () => {
    await expect(asApp(() => query.defaultLocation(branchB))).rejects.toThrow(/location/i);
  });
});

describe('stock in and out (ADR 0021 tests 1 and 2)', () => {
  it('a first receipt starts the rows at zero, then raises on hand and writes one movement', async () => {
    const part = await addPart();
    const before = await asApp(() => query.lockForIn(x.branchId, part));
    expect(before).toMatchObject({ onHand: '0.000', avgCost: '0.00' });
    await asApp(() => receive(x.branchId, part, '10', '100.00', '100.00'));
    expect(await asApp(() => query.onHand(x.branchId, part))).toBe('10.000');
    expect(await movementSum(x.branchId, part)).toBe('10.000');
  });

  it('takeOut lowers on hand atomically; asking for more than there is changes nothing and returns null', async () => {
    const part = await addPart();
    await asApp(() => receive(x.branchId, part, '6', '100.00', '100.00'));
    const location = await asApp(() => query.defaultLocation(x.branchId));
    expect(await asApp(() => query.takeOut(x.branchId, part, location, '4'))).toBe('2.000');
    expect(await asApp(() => query.takeOut(x.branchId, part, location, '3'))).toBeNull();
    expect(await asApp(() => query.onHand(x.branchId, part))).toBe('2.000');
  });

  it('costForOut reads the branch’s average cost; none yet is null', async () => {
    const part = await addPart();
    expect(await asApp(() => query.costForOut(x.branchId, part))).toBeNull();
    await asApp(() => receive(x.branchId, part, '2', '105.50', '105.50'));
    expect(await asApp(() => query.costForOut(x.branchId, part))).toBe('105.50');
  });
});

describe('ADR 0054 test 16: per-branch totals', () => {
  it('two branches with different stock: each on hand equals that branch’s movements', async () => {
    const part = await addPart();
    await asApp(() => receive(x.branchId, part, '7', '100.00', '100.00'), [x.branchId, branchB]);
    await asApp(() => receive(branchB, part, '3', '110.00', '110.00'), [x.branchId, branchB]);
    const [a, b] = await asApp(
      () => Promise.all([query.onHand(x.branchId, part), query.onHand(branchB, part)]),
      [x.branchId, branchB],
    );
    expect([a, b]).toEqual(['7.000', '3.000']);
    expect(await movementSum(x.branchId, part)).toBe('7.000');
    expect(await movementSum(branchB, part)).toBe('3.000');
  });
});
