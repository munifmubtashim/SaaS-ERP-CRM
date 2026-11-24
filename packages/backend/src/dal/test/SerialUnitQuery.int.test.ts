import { randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { ProductQuery } from '../query/ProductQuery.js';
import { SerialUnitQuery } from '../query/SerialUnitQuery.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * SerialUnitQuery (ADR 0020 sections 2 to 4), as erp_app inside the request's tenant transaction. Every status
 * change is one conditional UPDATE (invariant 6): reserve, release, sell, deliver; two parallel reservations or
 * sells of one unit, one wins (F-02). ADR 0020 test 9 (an archived product's unit can't be sold) and test 10 (dal
 * half: no unit DTO carries the cost). The table's own rules are SerialUnits.int.test.ts (#106).
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 6, txTimeoutMs: 15_000 });
const query = new SerialUnitQuery();

let x: Tree;
let y: Tree;
let productX: string;
let archivedX: string;

/** As the owner in the tree's scope: a serial-tracked product. */
async function addProduct(tree: Tree, status: 'active' | 'archived' = 'active'): Promise<string> {
  return owner.$transaction(async (tx) => {
    const [id] = (await newIds(tx, 1)) as [string];
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    await tx.$executeRaw`
      INSERT INTO product (id, business_id, code, name, unit, tracking, sell_price, status)
      VALUES (${id}::uuid, ${tree.businessId}::uuid, ${`B-${id.slice(-8)}`}, 'Bike', 'pcs', 'serial', 185000.00, ${status})`;
    return id;
  });
}

/** As the owner: one unit in stock at the tree's branch, with its own cost. Returns its id and serial number. */
async function addUnit(tree: Tree, productId: string): Promise<{ id: string; serialNo: string }> {
  return owner.$transaction(async (tx) => {
    const [id] = (await newIds(tx, 1)) as [string];
    const serialNo = `CH-${randomBytes(5).toString('hex')}`;
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    await tx.$executeRaw`
      INSERT INTO serial_unit (id, business_id, branch_id, product_id, serial_no, unit_cost)
      VALUES (${id}::uuid, ${tree.businessId}::uuid, ${tree.branchId}::uuid, ${productId}::uuid, ${serialNo}, 150000.25)`;
    return { id, serialNo };
  });
}

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
  [productX, archivedX] = await Promise.all([addProduct(x), addProduct(x, 'archived')]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

const inRequest = <T>(tree: Tree, fn: () => Promise<T>) =>
  runInTenantScope(
    app,
    { organizationId: tree.organizationId, businessIds: [tree.businessId], branchIds: [tree.branchId] },
    fn,
  );

/** The field codes of a thrown 409, or the error itself if it isn't one. */
async function conflictCodes(work: Promise<unknown>): Promise<string[] | unknown> {
  const error = await work.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (error instanceof AppError && error.code === 'CONFLICT') return error.fields.map((field) => field.code);
  return error;
}

const statusOf = async (tree: Tree, serialNo: string) =>
  (await inRequest(tree, () => query.findBySerial(serialNo)))?.status;

describe('SerialUnitQuery reads (ADR 0020 test 1 and test 10, dal half)', () => {
  it('finds a unit by serial number, without its cost; business Y finds nothing', async () => {
    const unit = await addUnit(x, productX);
    const found = await inRequest(x, () => query.findBySerial(unit.serialNo));
    expect(found).toMatchObject({ id: unit.id, serialNo: unit.serialNo, status: 'in_stock', version: 1 });
    expect(Object.keys(found ?? {}).some((key) => key.toLowerCase().includes('cost'))).toBe(false);
    expect(await inRequest(y, () => query.findBySerial(unit.serialNo))).toBeNull();
  });

  it('lists a branch by status, in id order, without cost', async () => {
    const units = [await addUnit(x, productX), await addUnit(x, productX)];
    const listed = await inRequest(x, () =>
      query.listByBranch(x.branchId, { status: 'in_stock', limit: 500 }),
    );
    const ids = listed.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(units.map((unit) => unit.id)));
    expect(ids).toEqual([...ids].sort());
    expect(listed.every((row) => !('unitCost' in row))).toBe(true);
    expect(await inRequest(y, () => query.listByBranch(x.branchId, { limit: 500 }))).toEqual([]);
  });
});

describe('reserve and release', () => {
  it('reserves an in-stock unit for a reference; a second reservation is 409 unit.not_available', async () => {
    const unit = await addUnit(x, productX);
    const ref = randomUUID();
    const reserved = await inRequest(x, () => query.reserve(unit.id, x.branchId, ref));
    expect(reserved).toMatchObject({ status: 'reserved', reservedByRef: ref, version: 2 });
    expect(await conflictCodes(inRequest(x, () => query.reserve(unit.id, x.branchId, randomUUID())))).toEqual(
      ['unit.not_available'],
    );
  });

  it('two parallel reservations of one unit: exactly one wins, the other is 409', async () => {
    const unit = await addUnit(x, productX);
    const outcomes = await Promise.allSettled([
      inRequest(x, () => query.reserve(unit.id, x.branchId, randomUUID())),
      inRequest(x, () => query.reserve(unit.id, x.branchId, randomUUID())),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    const lost = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(await conflictCodes(Promise.reject(lost?.reason))).toEqual(['unit.not_available']);
    expect(await inRequest(x, () => query.findBySerial(unit.serialNo))).toMatchObject({ version: 2 });
  });

  it('only the holder releases: another reference is 409 unit.not_reserved; the holder returns it to stock', async () => {
    const unit = await addUnit(x, productX);
    const ref = randomUUID();
    await inRequest(x, () => query.reserve(unit.id, x.branchId, ref));
    expect(await conflictCodes(inRequest(x, () => query.release(unit.id, x.branchId, randomUUID())))).toEqual(
      ['unit.not_reserved'],
    );
    const released = await inRequest(x, () => query.release(unit.id, x.branchId, ref));
    expect(released).toMatchObject({ status: 'in_stock', reservedByRef: null });
  });

  it('a unit at another branch, or of another business, is not available to this request', async () => {
    const unit = await addUnit(x, productX);
    expect(
      await conflictCodes(inRequest(x, () => query.reserve(unit.id, randomUUID(), randomUUID()))),
    ).toEqual(['unit.not_available']);
    expect(await conflictCodes(inRequest(y, () => query.reserve(unit.id, y.branchId, randomUUID())))).toEqual(
      ['unit.not_available'],
    );
    expect(await statusOf(x, unit.serialNo)).toBe('in_stock');
  });
});

describe('sell and deliver', () => {
  it('sells an in-stock unit: returns its own cost (to the sale only) as a string, and records the invoice', async () => {
    const unit = await addUnit(x, productX);
    const invoice = randomUUID();
    expect(await inRequest(x, () => query.sell(unit.id, x.branchId, invoice, null))).toEqual({
      unitCost: '150000.25',
    });
    expect(await inRequest(x, () => query.findBySerial(unit.serialNo))).toMatchObject({
      status: 'sold',
      invoiceId: invoice,
    });
  });

  it('a reserved unit sells only for the reference that holds it', async () => {
    const unit = await addUnit(x, productX);
    const ref = randomUUID();
    await inRequest(x, () => query.reserve(unit.id, x.branchId, ref));
    expect(
      await conflictCodes(inRequest(x, () => query.sell(unit.id, x.branchId, randomUUID(), null))),
    ).toEqual(['unit.not_available']);
    await expect(inRequest(x, () => query.sell(unit.id, x.branchId, randomUUID(), ref))).resolves.toEqual({
      unitCost: '150000.25',
    });
  });

  it('5. two parallel sells of one unit: exactly one gets it; nothing of the other remains', async () => {
    const unit = await addUnit(x, productX);
    const invoices = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled(
      invoices.map((invoice) => inRequest(x, () => query.sell(unit.id, x.branchId, invoice, null))),
    );
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    const winner = invoices[outcomes.findIndex((outcome) => outcome.status === 'fulfilled')];
    expect(await inRequest(x, () => query.findBySerial(unit.serialNo))).toMatchObject({
      status: 'sold',
      invoiceId: winner,
      version: 2,
    });
  });

  it('9. a unit of an archived product is not sold: 409 product.archived, and it stays in stock', async () => {
    const unit = await addUnit(x, archivedX);
    expect(
      await conflictCodes(inRequest(x, () => query.sell(unit.id, x.branchId, randomUUID(), null))),
    ).toEqual(['product.archived']);
    expect(await statusOf(x, unit.serialNo)).toBe('in_stock');
  });

  it('delivers a sold unit for its own invoice only; an unsold unit is 409 unit.not_sold', async () => {
    const unit = await addUnit(x, productX);
    expect(await conflictCodes(inRequest(x, () => query.deliver(unit.id, x.branchId, randomUUID())))).toEqual(
      ['unit.not_sold'],
    );
    const invoice = randomUUID();
    await inRequest(x, () => query.sell(unit.id, x.branchId, invoice, null));
    expect(await conflictCodes(inRequest(x, () => query.deliver(unit.id, x.branchId, randomUUID())))).toEqual(
      ['unit.not_sold'],
    );
    expect(await inRequest(x, () => query.deliver(unit.id, x.branchId, invoice))).toMatchObject({
      status: 'delivered',
      version: 3,
    });
  });
});

describe('a sale and an archive of the same product at the same moment (shared lock on the product)', () => {
  const products = new ProductQuery();

  /** Runs `first` in a request and holds its transaction open; then starts `second` and reports whether it waited. */
  async function overlap<A, B>(first: () => Promise<A>, second: () => Promise<B>) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const firstDone = new Promise<void>((resolve) => (started = resolve));
    const one = inRequest(x, async () => {
      const result = await first();
      started();
      await held;
      return result;
    });
    await firstDone;
    let settled = false;
    const two = inRequest(x, second).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    void two.finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const waited = !settled;
    release();
    return { waited, first: await one, second: await two };
  }

  it('archive first: the sale waits for it, then is refused with product.archived; the unit stays in stock', async () => {
    const productId = await addProduct(x);
    const unit = await addUnit(x, productId);
    const { waited, second } = await overlap(
      () => products.edit(productId, 1, { status: 'archived' }),
      () => query.sell(unit.id, x.branchId, randomUUID(), null),
    );
    expect(waited).toBe(true);
    expect(second.ok).toBe(false);
    expect(await conflictCodes(Promise.reject(second.ok ? null : second.error))).toEqual([
      'product.archived',
    ]);
    expect(await statusOf(x, unit.serialNo)).toBe('in_stock');
  });

  it('sale first: the archive waits for the sale to commit; the unit ends sold and the product archived', async () => {
    const productId = await addProduct(x);
    const unit = await addUnit(x, productId);
    const { waited, second } = await overlap(
      () => query.sell(unit.id, x.branchId, randomUUID(), null),
      () => products.edit(productId, 1, { status: 'archived' }),
    );
    expect(waited).toBe(true);
    expect(second).toMatchObject({ ok: true, value: { status: 'archived' } });
    expect(await statusOf(x, unit.serialNo)).toBe('sold');
  });
});
