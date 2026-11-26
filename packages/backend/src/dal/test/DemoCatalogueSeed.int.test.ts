import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { seedDemoCatalogue } from '../prisma/seeds/demoCatalogue.js';
import { seedDemoOrganization, type DemoIds } from '../prisma/seeds/demoOrganization.js';
import { seedDemoVehicles } from '../prisma/seeds/demoVehicle.js';
import { setScope } from './support/orgTree.js';

/**
 * The demo seed's step 3 and the units of step 4 (docs/demo-seed-spec.md section 2, ADR 0058 S2): about 40 parts,
 * 8 bike models, the registration-fee product, and 2 to 6 chassis units per model with their engine numbers in the
 * Vehicle pack's vehicle_unit (spec O-11). Owner writes with fixed ids; the units' opening movements are
 * businessLogic's (demoSeedStock.int.test.ts). Every value is invented.
 */
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 20_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

afterAll(async () => {
  await owner.$disconnect();
});

const ids: DemoIds = {
  organizationId: randomUUID(),
  legalEntityId: randomUUID(),
  businessId: randomUUID(),
  branchIds: [randomUUID(), randomUUID()],
  ownerUserId: randomUUID(),
  ownerScopeId: randomUUID(),
};

interface ProductRow {
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
  tracking: string;
  sell_price: string;
  is_pass_through: boolean;
  vat_on_fee: boolean;
}

const read = <T>(fn: (tx: Parameters<Parameters<DbClient['$transaction']>[0]>[0]) => Promise<T>) =>
  owner.$transaction(async (tx) => {
    await setScope(tx, ids.organizationId, [ids.businessId], ids.branchIds);
    return fn(tx);
  });

const products = () =>
  read(
    (tx) =>
      tx.$queryRaw<ProductRow[]>`
      SELECT code, name, brand, category, tracking, sell_price::text, is_pass_through, vat_on_fee
        FROM product WHERE business_id = ${ids.businessId}::uuid ORDER BY code`,
  );
const units = () =>
  read(
    (tx) =>
      tx.$queryRaw<
        { serial_no: string; engine_no: string; branch_id: string; unit_cost: string; code: string }[]
      >`
      SELECT s.serial_no, v.engine_no, s.branch_id::text, s.unit_cost::text, p.code
        FROM serial_unit s JOIN vehicle_unit v ON v.serial_unit_id = s.id JOIN product p ON p.id = s.product_id
       WHERE s.business_id = ${ids.businessId}::uuid ORDER BY s.serial_no`,
  );

let catalogue: ProductRow[];

beforeAll(async () => {
  await seedDemoOrganization(
    owner,
    { email: `cat-${ids.businessId.slice(0, 8)}@example.com`, displayName: 'Demo Owner', passwordHash: HASH },
    ids,
  );
  await seedDemoCatalogue(owner, ids);
  await seedDemoVehicles(owner, ids);
  catalogue = await products();
});

describe('the catalogue (spec section 2)', () => {
  const amount = (s: string) => Number(s);

  it('has about 40 quantity-tracked parts in Parts, Oil, Tyres and Accessories, priced 180.00 to 9,500.00', () => {
    const parts = catalogue.filter((p) => p.tracking === 'quantity' && !p.is_pass_through);
    expect(parts.length).toBeGreaterThanOrEqual(38);
    expect(parts.length).toBeLessThanOrEqual(42);
    expect(new Set(parts.map((p) => p.category))).toEqual(new Set(['Parts', 'Oil', 'Tyres', 'Accessories']));
    for (const p of parts) {
      expect(p.code).toMatch(/^[0-9A-Z]{3}-[0-9A-Z]{5}-[0-9]{2}$/);
      expect(amount(p.sell_price)).toBeGreaterThanOrEqual(180);
      expect(amount(p.sell_price)).toBeLessThanOrEqual(9500);
      expect(p.sell_price).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('has 8 serial-tracked bike models priced 1,45,000.00 to 4,10,000.00', () => {
    const models = catalogue.filter((p) => p.tracking === 'serial');
    expect(models).toHaveLength(8);
    expect(models.map((m) => m.name)).toEqual(expect.arrayContaining(['Velo 150 V3', 'Ridge 125 S']));
    for (const m of models) {
      expect(amount(m.sell_price)).toBeGreaterThanOrEqual(145000);
      expect(amount(m.sell_price)).toBeLessThanOrEqual(410000);
    }
  });

  it('has one registration-fee product: pass-through on, VAT on fee off (invariant 8, item 3d)', () => {
    expect(catalogue.filter((p) => p.is_pass_through)).toEqual([
      expect.objectContaining({ tracking: 'quantity', is_pass_through: true, vat_on_fee: false }),
    ]);
  });

  it('names one invented brand, never a real one', () => {
    expect(new Set(catalogue.filter((p) => p.brand !== null).map((p) => p.brand))).toEqual(
      new Set(['Sample Bikes']),
    );
    const text = JSON.stringify(catalogue).toLowerCase();
    for (const real of ['yamaha', 'honda', 'suzuki', 'bajaj', 'hero', 'tvs', 'runner', 'walton']) {
      expect(text).not.toContain(real);
    }
  });
});

describe('the chassis units (spec section 2, decision 5)', () => {
  it('has 2 to 6 units per model at the Showroom, about 30 in all, each with its own cost and an engine number', async () => {
    const rows = await units();
    expect(rows.length).toBeGreaterThanOrEqual(26);
    expect(rows.length).toBeLessThanOrEqual(34);
    const perModel = new Map<string, number>();
    for (const u of rows) perModel.set(u.code, (perModel.get(u.code) ?? 0) + 1);
    expect(perModel.size).toBe(8);
    for (const n of perModel.values()) {
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    }
    for (const u of rows) {
      expect(u.branch_id).toBe(ids.branchIds[0]);
      expect(u.serial_no).toMatch(/^[A-Z0-9]{3}-\d{6}$/);
      expect(u.engine_no).toMatch(/^E[A-Z0-9]{2}-\d{6}$/);
      expect(u.unit_cost).toMatch(/^\d+\.\d{2}$/);
    }
    expect(new Set(rows.map((u) => u.serial_no)).size).toBe(rows.length);
  });
});

describe('a second run (spec section 1)', () => {
  it('writes nothing', async () => {
    const before = { products: await products(), units: await units() };
    await seedDemoCatalogue(owner, ids);
    await seedDemoVehicles(owner, ids);
    expect({ products: await products(), units: await units() }).toEqual(before);
  });
});
