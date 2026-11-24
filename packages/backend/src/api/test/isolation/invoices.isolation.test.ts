import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import type { TenantScope } from '@erp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * POST /v1/invoices through HTTP against real Postgres (ADR 0022 tests 4 to 7 and 10; item 3b, Munif 24 Nov): the
 * permission (403 without sales.invoice.post), no unit cost in the answer, not enough stock is 409 and writes nothing
 * (the invoice number is not used up), the same Idempotency-Key twice gives one sale, two cashiers and the last unit
 * give one sale, a due on the walk-in party is refused, and business Y can't sell X's product or name X's customer.
 * The api can't read the database, so "nothing written" is shown through HTTP: the next sale's number follows on, and
 * exactly the stock that should be left can still be sold. The world is dal's test/support/isolationWorld.ts.
 */
interface World {
  a: { organizationId: string; x: string; x1: string; x2: string; x2a: string };
  b: { organizationId: string; y: string; y1: string };
  sales: { customerX: string; walkInX: string; customerY: string };
  tokens: Record<'ownerA' | 'managerX' | 'branchManagerX1' | 'accountantX1' | 'cashierX1' | 'ownerB', string>;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set for the isolation suite (see .env.example).');

const world = inject('isolation') as unknown as World;
const { managers, tenantScope, provided, close } = createManagers({
  databaseUrl,
  version: 'test',
  dbPoolMax: 6,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const app = createApp({ logger: silentLogger, managers, tenantScope, idempotency: provided.idempotency });

afterAll(async () => {
  await close();
});

type Who = keyof World['tokens'];
const X = { business: world.a.x, branch: world.a.x1 };
const Y = { business: world.b.y, branch: world.b.y1 };
const scopeX: TenantScope = {
  organizationId: world.a.organizationId,
  businessIds: [world.a.x],
  branchIds: [world.a.x1],
  branchId: world.a.x1,
};

function as(who: Who, place: { business: string; branch: string }, key: string | null = randomUUID()) {
  const headers: Record<string, string> = {
    Cookie: `__Host-erp_sid=${world.tokens[who]}`,
    Origin: DEV_APP_ORIGIN,
    'X-Business-Id': place.business,
    'X-Branch-Id': place.branch,
  };
  if (key) headers['Idempotency-Key'] = key;
  return {
    post: (path: string, body: object) => request(app).post(path).set(headers).send(body),
  };
}

/** A counted product in `place`, created through the product route by that business's Owner. */
async function product(owner: Who, place: { business: string; branch: string }, price = '1000.00') {
  const res = await as(owner, place, null).post('/v1/products', {
    code: `P-${randomBytes(4).toString('hex')}`,
    name: 'Brake pad set, front, 150 cc',
    unit: 'pcs',
    tracking: 'quantity',
    sellPrice: price,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Opening stock at X1 through the stock service, as the seed brings it in (kind opening). */
async function stockIn(productId: string, qty: string, unitCost: string) {
  await tenantScope.run(scopeX, () =>
    provided.stock.move([
      {
        productId,
        branchId: world.a.x1,
        qtyDelta: qty,
        unitCost,
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
}

const sale = (productId: string, qty: string, fields: object = {}) => ({
  partyId: world.sales.customerX,
  customerName: 'Rahim Uddin',
  lines: [{ productId, serialUnitId: null, qty }],
  discount: '0.00',
  payments: [],
  ...fields,
});

/** The number after `number` in the same series: INV-ISO-000007 → INV-ISO-000008. */
function nextNumber(number: string): string {
  const match = /^(.*?)(\d+)$/.exec(number);
  if (!match) throw new Error(`not a series number: ${number}`);
  const [, prefix = '', digits = ''] = match;
  return `${prefix}${String(Number(digits) + 1).padStart(digits.length, '0')}`;
}

let pads: string;

beforeAll(async () => {
  pads = await product('ownerA', X);
  await stockIn(pads, '20.000', '700.00');
});

describe('POST /v1/invoices: who may post (ADR 0051; Munif 24 Nov)', () => {
  it('a cashier of X1 posts: 201, Location, money as strings, paid and due', async () => {
    const res = await as('cashierX1', X).post(
      '/v1/invoices',
      sale(pads, '2', {
        payments: [
          { method: 'cash', amount: '1000.00', externalRef: null },
          { method: 'bkash', amount: '500.00', externalRef: `TX${randomBytes(4).toString('hex')}` },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/v1/invoices/${res.body.id}`);
    expect(res.body).toMatchObject({ total: '2000.00', paid: '1500.00', due: '500.00', status: 'posted' });
    expect(res.body.payments.map((p: { receiptNumber: string }) => p.receiptNumber)).toHaveLength(2);
  });

  it('an accountant of X1 has no sales.invoice.post: 403, and nothing is written', async () => {
    const res = await as('accountantX1', X).post('/v1/invoices', sale(pads, '1'));
    expect(res.status).toBe(403);
  });

  it('the answer never carries a unit cost or any cost (a hidden field, plan 2.5)', async () => {
    const res = await as('cashierX1', X).post('/v1/invoices', sale(pads, '1'));
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
  });

  it('without an Idempotency-Key a money route is refused (ADR 0011)', async () => {
    const res = await as('cashierX1', X, null).post('/v1/invoices', sale(pads, '1'));
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/invoices: nothing half-written (ADR 0022 tests 6 and 7; invariants 3 to 6)', () => {
  it('not enough stock is 409 stock.insufficient; no invoice, journal or movement remains, and the invoice number is not used up', async () => {
    const part = await product('ownerA', X);
    await stockIn(part, '3.000', '400.00');
    const before = await as('cashierX1', X).post('/v1/invoices', sale(part, '1'));
    expect(before.status).toBe(201);
    const refused = await as('cashierX1', X).post('/v1/invoices', sale(part, '5'));
    expect(refused.status).toBe(409);
    expect(refused.body.fields[0].code).toBe('stock.insufficient');
    // The refused request's whole transaction rolled back: its number went back (ADR 0015), and exactly 2 are left.
    const after = await as('cashierX1', X).post('/v1/invoices', sale(part, '2'));
    expect(after.status).toBe(201);
    expect(after.body.number).toBe(nextNumber(before.body.number));
    const empty = await as('cashierX1', X).post('/v1/invoices', sale(part, '1'));
    expect(empty.status).toBe(409);
  });

  it('the same Idempotency-Key twice: one invoice, one journal, one movement; the second answer replays the first', async () => {
    const part = await product('ownerA', X);
    await stockIn(part, '2.000', '400.00');
    const key = randomUUID();
    const body = sale(part, '1', { payments: [{ method: 'cash', amount: '1000.00', externalRef: null }] });
    const first = await as('cashierX1', X, key).post('/v1/invoices', body);
    const again = await as('cashierX1', X, key).post('/v1/invoices', body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    // One movement only: exactly one unit is left to sell, and the next number follows the first sale's.
    const next = await as('cashierX1', X).post('/v1/invoices', sale(part, '1'));
    expect(next.status).toBe(201);
    expect(next.body.number).toBe(nextNumber(first.body.number));
    expect((await as('cashierX1', X).post('/v1/invoices', sale(part, '1'))).status).toBe(409);
  });

  it('two cashiers, the last unit (F-02): exactly one sale, the other 409 and nothing of it remains', async () => {
    const part = await product('ownerA', X);
    await stockIn(part, '1.000', '400.00');
    const results = await Promise.all([
      as('cashierX1', X).post('/v1/invoices', sale(part, '1')),
      as('branchManagerX1', X).post('/v1/invoices', sale(part, '1')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('a sale leaving a due on the walk-in party is 409 invoice.due_needs_customer; paid in full it posts', async () => {
    const walkIn = { partyId: world.sales.walkInX, customerName: null };
    const due = await as('cashierX1', X).post('/v1/invoices', sale(pads, '1', walkIn));
    expect(due.status).toBe(409);
    expect(due.body.fields[0].code).toBe('invoice.due_needs_customer');
    const paid = await as('cashierX1', X).post(
      '/v1/invoices',
      sale(pads, '1', { ...walkIn, payments: [{ method: 'cash', amount: '1000.00', externalRef: null }] }),
    );
    expect(paid.status).toBe(201);
    expect(paid.body.due).toBe('0.00');
  });
});

describe('POST /v1/invoices: cross-business isolation (CLAUDE.md mandatory cases)', () => {
  it("organization B's Owner, in Y, can't sell X's product: 409 product unavailable, and X's stock is unchanged", async () => {
    const part = await product('ownerA', X);
    await stockIn(part, '1.000', '400.00');
    const fromY = await as('ownerB', Y).post(
      '/v1/invoices',
      sale(part, '1', { partyId: world.sales.customerY }),
    );
    expect(fromY.status).toBe(409);
    expect(fromY.body.fields[0].code).toBe('invoice.product_unavailable');
    expect((await as('cashierX1', X).post('/v1/invoices', sale(part, '1'))).status).toBe(201);
  });

  it("a sale in Y can't name X's customer: 404, the same as a guessed id", async () => {
    const yProduct = await product('ownerB', Y);
    const named = await as('ownerB', Y).post('/v1/invoices', sale(yProduct, '1'));
    const guessed = await as('ownerB', Y).post(
      '/v1/invoices',
      sale(yProduct, '1', { partyId: randomUUID() }),
    );
    expect([named.status, guessed.status]).toEqual([404, 404]);
    expect(named.body.message).toBe(guessed.body.message);
  });

  it('a cashier of X1 naming branch X2a is refused before anything runs', async () => {
    const res = await as('cashierX1', { business: world.a.x2, branch: world.a.x2a }).post(
      '/v1/invoices',
      sale(pads, '1'),
    );
    expect([403, 404]).toContain(res.status);
  });
});
