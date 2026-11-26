import { randomBytes, randomUUID } from 'node:crypto';
import { AppError, type TenantScope } from '@erp/shared';
import { createDbClient } from '@erp/dal';
import { afterAll, describe, expect, it } from 'vitest';
import type { StockMovementDraft } from './contracts/provided/IStockService.js';
import { createManagers, DenyAllRoleSource } from './index.js';
import { stockContract } from './test/stockContract.js';

/**
 * StockService against real Postgres (ADR 0021 part 2 as amended by ADR 0054), through the service createManagers
 * builds: the ADR 0012 stock contract (the suite FakeStockService passes too), the weighted average (test 5), two
 * parallel sales of one serial unit (test 4), two documents moving the same two products in opposite orders
 * without a deadlock (test 10, Munif 24 Nov), and move()'s costs (the ADR 0012 amendment). Every case runs in its
 * own fresh business, so cases never share stock.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const { provided, tenantScope, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 6,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const owner = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });

interface World {
  scope: TenantScope;
  businessId: string;
  branchId: string;
}

/** A fresh organization, business and branch (its location comes from the branch trigger), as the owner. */
async function newWorld(): Promise<World> {
  const [org, legal, businessId, branchId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${org}, true), set_config('app.business_ids', ${businessId}, true),
             set_config('app.branch_ids', ${branchId}, true)`;
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${org}::uuid, 'Stock Test Org')`;
    await tx.$executeRaw`INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${legal}::uuid, ${org}::uuid, 'Stock Test Legal')`;
    await tx.$executeRaw`INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${businessId}::uuid, ${org}::uuid, ${legal}::uuid, 'Stock Test Business')`;
    await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${branchId}::uuid, ${businessId}::uuid, 'Stock Test Branch', 'STB')`;
  });
  return {
    scope: { organizationId: org, businessIds: [businessId], branchIds: [branchId], branchId },
    businessId,
    branchId,
  };
}

async function asOwner<T>(
  world: World,
  fn: (tx: Parameters<Parameters<typeof owner.$transaction>[0]>[0]) => Promise<T>,
) {
  return owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${world.scope.organizationId}, true),
             set_config('app.business_ids', ${world.businessId}, true),
             set_config('app.branch_ids', ${world.branchId}, true)`;
    return fn(tx);
  });
}

async function addProduct(world: World, tracking: 'quantity' | 'serial'): Promise<string> {
  return asOwner(world, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${world.businessId}::uuid, ${`P-${randomBytes(5).toString('hex')}`}, 'Stock product', 'pcs', ${tracking},
              1000.00)
      RETURNING id::text`;
    if (!row) throw new Error('no product');
    return row.id;
  });
}

async function addUnit(world: World, productId: string, unitCost = '150000.00'): Promise<string> {
  return asOwner(world, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
      VALUES (${world.businessId}::uuid, ${world.branchId}::uuid, ${productId}::uuid,
              ${`CH-${randomBytes(5).toString('hex')}`}, ${unitCost}::numeric)
      RETURNING id::text`;
    if (!row) throw new Error('no unit');
    return row.id;
  });
}

const move = (world: World, drafts: StockMovementDraft[]) =>
  tenantScope.run(world.scope, () => provided.stock.move(drafts));

const receipt = (world: World, productId: string, qty: string, unitCost: string): StockMovementDraft => ({
  productId,
  branchId: world.branchId,
  qtyDelta: qty,
  unitCost,
  source: { type: 'test_receipt', id: randomUUID() },
});
const sale = (world: World, productId: string, qty: string, unitId?: string): StockMovementDraft => ({
  productId,
  branchId: world.branchId,
  qtyDelta: qty,
  ...(unitId ? { unitId } : {}),
  source: { type: 'test_sale', id: randomUUID() },
});

/** The movement row as the owner reads it: kind and the (hidden) unit cost. */
async function movementRow(world: World, id: string) {
  return asOwner(world, async (tx) => {
    const [row] = await tx.$queryRaw<
      {
        product_id: string;
        qty_delta: string;
        serial_unit_id: string | null;
        kind: string;
        unit_cost: string;
      }[]
    >`SELECT product_id::text, qty_delta::text, serial_unit_id::text, kind, unit_cost::text
        FROM stock_movement WHERE id = ${id}::uuid`;
    if (!row) throw new Error('no movement');
    return row;
  });
}

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

/*
 * The ADR 0012 contract suite, unchanged. Its fixed ids (one branch, three products, one unit) are mapped to rows of
 * a fresh business for every case, and mapped back when the suite reads a movement.
 */
const CONTRACT_BRANCH = '01937000-0000-7000-8000-0000000000e0';
const CONTRACT_PRODUCTS = {
  '01937000-0000-7000-8000-0000000000f0': 'quantity',
  '01937000-0000-7000-8000-0000000000f1': 'quantity',
  '01937000-0000-7000-8000-0000000000f2': 'serial',
} as const;
const CONTRACT_UNIT = '01937000-0000-7000-8000-0000000000a9';

stockContract('StockService (real Postgres)', async () => {
  const world = await newWorld();
  const ids = new Map<string, string>([[CONTRACT_BRANCH, world.branchId]]);
  for (const [fake, tracking] of Object.entries(CONTRACT_PRODUCTS))
    ids.set(fake, await addProduct(world, tracking));
  ids.set(CONTRACT_UNIT, await addUnit(world, ids.get('01937000-0000-7000-8000-0000000000f2') ?? ''));
  const back = new Map([...ids].map(([fake, real]) => [real, fake]));
  const real = (id: string) => ids.get(id) ?? id;
  return {
    service: {
      move: (drafts) =>
        move(
          world,
          drafts.map((d) => ({
            ...d,
            productId: real(d.productId),
            branchId: real(d.branchId),
            ...(d.unitId ? { unitId: real(d.unitId) } : {}),
            // The suite reuses source ids across calls; a real ledger refuses a repeated source line.
            source: { type: d.source.type, id: randomUUID() },
          })),
        ),
    },
    onHand: (productId, branchId) =>
      tenantScope.run(world.scope, async () => {
        const rows = await asOwner(
          world,
          (tx) => tx.$queryRaw<{ on_hand: string }[]>`
          SELECT coalesce(sum(on_hand), 0)::numeric(18,3)::text AS on_hand FROM stock_balance
           WHERE branch_id = ${real(branchId)}::uuid AND product_id = ${real(productId)}::uuid`,
        );
        return rows[0]?.on_hand ?? '0.000';
      }),
    movementOf: async (movementId) => {
      const row = await movementRow(world, movementId);
      return {
        productId: back.get(row.product_id) ?? row.product_id,
        qtyDelta: row.qty_delta,
        ...(row.serial_unit_id ? { unitId: back.get(row.serial_unit_id) ?? row.serial_unit_id } : {}),
      };
    },
  };
});

describe('ADR 0021 test 5: weighted average per branch', () => {
  it('10 at ৳100.00, then 10 at ৳110.00, averages ৳105.00; a sale then costs ৳105.00 and costs come back as strings', async () => {
    const world = await newWorld();
    const part = await addProduct(world, 'quantity');
    const first = await move(world, [receipt(world, part, '10.000', '100.00')]);
    expect(first.costs).toEqual(['100.00']);
    await move(world, [receipt(world, part, '10.000', '110.00')]);
    const sold = await move(world, [sale(world, part, '-4.000')]);
    expect(sold.costs).toEqual(['105.00']);
    const row = await movementRow(world, sold.movementIds[0] ?? '');
    expect(row).toMatchObject({ kind: 'sale', unit_cost: '105.00', qty_delta: '-4.000' });
  });

  it('a serial unit carries its own cost, not an average (invariant 7)', async () => {
    const world = await newWorld();
    const bike = await addProduct(world, 'serial');
    const unit = await addUnit(world, bike, '148500.00');
    await move(world, [{ ...receipt(world, bike, '1.000', '148500.00'), unitId: unit }]);
    const sold = await move(world, [sale(world, bike, '-1.000', unit)]);
    expect(sold.costs).toEqual(['148500.00']);
  });

  it('an opening or adjustment kind and its reason are recorded when given (ADR 0012 amendment)', async () => {
    const world = await newWorld();
    const part = await addProduct(world, 'quantity');
    const opened = await move(world, [{ ...receipt(world, part, '3.000', '50.00'), kind: 'opening' }]);
    const adjusted = await move(world, [
      { ...sale(world, part, '-1.000'), kind: 'adjustment', reason: 'Returned to supplier' },
    ]);
    expect((await movementRow(world, opened.movementIds[0] ?? '')).kind).toBe('opening');
    expect((await movementRow(world, adjusted.movementIds[0] ?? '')).kind).toBe('adjustment');
  });
});

describe('concurrency (invariant 6)', () => {
  it('ADR 0021 test 4: two parallel sales of the same serial unit, exactly one succeeds', async () => {
    const world = await newWorld();
    const bike = await addProduct(world, 'serial');
    const unit = await addUnit(world, bike);
    await move(world, [{ ...receipt(world, bike, '1.000', '150000.00'), unitId: unit }]);
    const results = await Promise.allSettled([
      move(world, [sale(world, bike, '-1.000', unit)]),
      move(world, [sale(world, bike, '-1.000', unit)]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(AppError);
    expect((lost.reason as AppError).fields[0]?.code).toMatch(/unit\.not_available|stock\.insufficient/);
  });

  it('ADR 0021 test 10: two documents moving the same two products in opposite orders do not deadlock', async () => {
    const world = await newWorld();
    const [a, b] = [await addProduct(world, 'quantity'), await addProduct(world, 'quantity')];
    await move(world, [receipt(world, a, '50.000', '10.00'), receipt(world, b, '50.000', '10.00')]);
    for (let round = 0; round < 10; round += 1) {
      const results = await Promise.allSettled([
        move(world, [sale(world, a, '-1.000'), sale(world, b, '-1.000')]),
        move(world, [sale(world, b, '-1.000'), sale(world, a, '-1.000')]),
      ]);
      const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(failures.map((f) => String(f.reason))).toEqual([]);
    }
    const left = await asOwner(
      world,
      (tx) => tx.$queryRaw<{ on_hand: string }[]>`
      SELECT on_hand::text FROM stock_balance WHERE product_id IN (${a}::uuid, ${b}::uuid) ORDER BY on_hand`,
    );
    expect(left.map((r) => r.on_hand)).toEqual(['30.000', '30.000']);
  });
});
