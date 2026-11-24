import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { InventoryQuery } from '../query/InventoryQuery.js';
import { StockQuery } from '../query/StockQuery.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';
import { addParty } from './support/party.js';

/**
 * The stock reads (Munif, 24 Nov), as erp_app under RLS:
 * - StockQuery.stockRows: GET /v1/stock's rows (#34's stockRowSchema): one per product per branch, on hand from the
 *   balance cache, search, a branch filter and a (product, branch) cursor; a branch scope sees only its branches;
 * - StockQuery.posCatalogItems: GET /v1/stock/pos-catalog's items: every active product with its on hand at the
 *   branch (0.000 when none) and the serial units in stock there;
 * - InventoryQuery.walkInPartyId: the business's walk-in party, or null.
 * No read returns a cost. Every value is invented.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
const stock = new StockQuery();
const inventory = new InventoryQuery();

let x: Tree;
let branchB: string;

const asApp = <T>(fn: () => Promise<T>, branchIds = [x.branchId]) =>
  runInTenantScope(
    app,
    { organizationId: x.organizationId, businessIds: [x.businessId], branchIds, branchId: branchIds[0] },
    fn,
  );

async function addProduct(fields: { tracking?: string; status?: string; code?: string } = {}) {
  return owner.$transaction(async (tx) => {
    await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price, status, category)
      VALUES (${x.businessId}::uuid, ${fields.code ?? `P-${randomBytes(5).toString('hex')}`}, 'Brake pad set', 'pcs',
              ${fields.tracking ?? 'quantity'}, 1000.00, ${fields.status ?? 'active'}, 'Parts')
      RETURNING id::text`;
    if (!row) throw new Error('no product');
    return row.id;
  });
}

async function addUnit(productId: string, branchId: string, status = 'in_stock') {
  return owner.$transaction(async (tx) => {
    await setScope(tx, x.organizationId, [x.businessId], [x.branchId, branchId]);
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost, status)
      VALUES (${x.businessId}::uuid, ${branchId}::uuid, ${productId}::uuid, ${`VL3-${randomBytes(4).toString('hex')}`},
              150000.00, ${status})
      RETURNING id::text`;
    if (!row) throw new Error('no unit');
    return row.id;
  });
}

/** Stock in as StockService does it: lock, add, record the movement. */
async function receive(branchId: string, productId: string, qty: string, unitId: string | null = null) {
  await asApp(async () => {
    const { locationId } = await stock.lockForIn(branchId, productId);
    await stock.addIn(branchId, productId, locationId, qty);
    await stock.setCost(branchId, productId, '700.00');
    await stock.insertMovement({
      branchId,
      productId,
      serialUnitId: unitId,
      qtyDelta: qty,
      unitCost: '700.00',
      kind: 'opening',
      reason: null,
      sourceType: 'test_opening',
      sourceId: randomUUID(),
    });
  }, [x.branchId, branchId]);
}

beforeAll(async () => {
  x = await createTree(owner);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'BRB');
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('StockQuery.stockRows (GET /v1/stock, #34 shape)', () => {
  it('one row per product per branch with the on hand, found by search, no cost', async () => {
    const code = `PRT-${randomBytes(4).toString('hex')}`;
    const part = await addProduct({ code });
    await receive(x.branchId, part, '3.000');
    const rows = await asApp(() => stock.stockRows({ search: code, branchId: null, after: null, limit: 10 }));
    expect(rows).toEqual([
      {
        productId: part,
        productCode: code,
        productName: 'Brake pad set',
        branchId: x.branchId,
        branchName: expect.any(String),
        onHand: '3.000',
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/cost/i);
  });

  it("a branch-A scope sees none of branch B's stock; with both branches, the filter picks one", async () => {
    const code = `PRT-${randomBytes(4).toString('hex')}`;
    const part = await addProduct({ code });
    await receive(branchB, part, '4.000');
    expect(
      await asApp(() => stock.stockRows({ search: code, branchId: null, after: null, limit: 10 })),
    ).toEqual([]);
    const both = await asApp(
      () => stock.stockRows({ search: code, branchId: branchB, after: null, limit: 10 }),
      [x.branchId, branchB],
    );
    expect(both.map((r) => [r.branchId, r.onHand])).toEqual([[branchB, '4.000']]);
  });

  it('pages by (product, branch): limit, then after the last row', async () => {
    const code = `PG-${randomBytes(3).toString('hex')}`;
    const [a, b] = [await addProduct({ code: `${code}-A` }), await addProduct({ code: `${code}-B` })];
    await receive(x.branchId, a, '1.000');
    await receive(x.branchId, b, '2.000');
    const first = await asApp(() => stock.stockRows({ search: code, branchId: null, after: null, limit: 1 }));
    const last = first.at(-1);
    if (!last) throw new Error('no first page');
    const second = await asApp(() =>
      stock.stockRows({
        search: code,
        branchId: null,
        after: { productId: last.productId, branchId: last.branchId },
        limit: 5,
      }),
    );
    expect([...first, ...second].map((r) => r.productId).sort()).toEqual([a, b].sort());
    expect(second.map((r) => r.productId)).not.toContain(last.productId);
  });
});

describe('StockQuery.posCatalogItems (GET /v1/stock/pos-catalog)', () => {
  it('every active product with its on hand at the branch (0.000 when none); archived ones are left out', async () => {
    const stocked = await addProduct();
    const none = await addProduct();
    const archived = await addProduct({ status: 'archived' });
    await receive(x.branchId, stocked, '5.000');
    const items = await asApp(() => stock.posCatalogItems(x.branchId));
    const byId = new Map(items.map((i) => [i.productId, i]));
    expect(byId.get(stocked)).toMatchObject({
      onHand: '5.000',
      tracking: 'quantity',
      sellPrice: '1000.00',
      units: [],
      category: 'Parts',
    });
    expect(byId.get(none)?.onHand).toBe('0.000');
    expect(byId.has(archived)).toBe(false);
    expect(JSON.stringify(items)).not.toMatch(/cost/i);
  });

  it('a serial product lists only its units in stock at this branch', async () => {
    const bike = await addProduct({ tracking: 'serial' });
    const [here, sold, elsewhere] = [
      await addUnit(bike, x.branchId),
      await addUnit(bike, x.branchId),
      await addUnit(bike, branchB),
    ];
    await receive(x.branchId, bike, '1.000', here);
    await receive(x.branchId, bike, '1.000', sold);
    await receive(branchB, bike, '1.000', elsewhere);
    await owner.$transaction(async (tx) => {
      await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
      await tx.$executeRaw`UPDATE serial_unit SET status = 'sold' WHERE id = ${sold}::uuid`;
    });
    const item = (await asApp(() => stock.posCatalogItems(x.branchId))).find((i) => i.productId === bike);
    expect(item?.units.map((u) => u.id)).toEqual([here]);
  });
});

describe('InventoryQuery.walkInPartyId', () => {
  it('null until the business has a walk-in party, then its id', async () => {
    expect(await asApp(() => inventory.walkInPartyId())).toBeNull();
    const walkIn = await addParty(owner, x, { walkIn: true });
    expect(await asApp(() => inventory.walkInPartyId())).toBe(walkIn);
  });
});
