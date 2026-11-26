import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import { invoiceDetailSchema, invoiceListResponseSchema, type TenantScope } from '@erp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * F4, GET /v1/invoices and GET /v1/invoices/:id, through HTTP against real Postgres (ADR 0059 section 2, tests 4 and 5).
 * Each test makes its own customer, invoices and payments through the routes and looks only at its own ids. The setup
 * repeats dues.isolation.test.ts and payments.isolation.test.ts; extracting it is a follow-up. The world is dal's
 * test/support/isolationWorld.ts.
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
type Place = { business: string; branch: string };
const X: Place = { business: world.a.x, branch: world.a.x1 };
const Y: Place = { business: world.b.y, branch: world.b.y1 };
const scopeX: TenantScope = {
  organizationId: world.a.organizationId,
  businessIds: [world.a.x],
  branchIds: [world.a.x1],
  branchId: world.a.x1,
};

function as(who: Who, place: Place) {
  const headers: Record<string, string> = {
    Cookie: `__Host-erp_sid=${world.tokens[who]}`,
    Origin: DEV_APP_ORIGIN,
    'X-Business-Id': place.business,
    'X-Branch-Id': place.branch,
  };
  return {
    get: (path: string) => request(app).get(path).set(headers),
    post: (path: string, body: object) =>
      request(app)
        .post(path)
        .set({ ...headers, 'Idempotency-Key': randomUUID() })
        .send(body),
  };
}

let phoneSeq = Math.floor(Math.random() * 80_000_000);
const nextPhone = () => `+88017${String(10_000_000 + (phoneSeq++ % 89_999_999)).slice(0, 8)}`;

async function customer(): Promise<string> {
  const res = await as('managerX', X).post('/v1/parties', {
    name: 'Invoice Read Customer',
    nameBn: null,
    kind: 'person',
    isCustomer: true,
    isSupplier: false,
    phone: nextPhone(),
    altPhone: null,
    email: null,
    address: null,
    area: null,
    creditLimit: null,
    payTermDays: null,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

let pads: string;

/** A posted invoice of 1,000.00 per pad, `paidNow` paid at the sale. Returns its id and number. */
async function invoice(
  partyId: string,
  qty: string,
  paidNow = '0.00',
): Promise<{ id: string; number: string }> {
  const res = await as('cashierX1', X).post('/v1/invoices', {
    partyId,
    customerName: 'Invoice Read Customer',
    lines: [{ productId: pads, serialUnitId: null, qty }],
    discount: '0.00',
    payments: paidNow === '0.00' ? [] : [{ method: 'cash', amount: paidNow, externalRef: null }],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.id as string, number: res.body.number as string };
}

async function pay(partyId: string, invoiceId: string | null, amount: string): Promise<void> {
  const res = await as('cashierX1', X).post('/v1/payments', {
    partyId,
    invoiceId,
    method: 'cash',
    amount,
    externalRef: null,
    note: null,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

beforeAll(async () => {
  const res = await as('ownerA', X).post('/v1/products', {
    code: `R-${randomBytes(4).toString('hex')}`,
    name: 'Brake shoe set, front',
    unit: 'pcs',
    tracking: 'quantity',
    sellPrice: '1000.00',
  });
  expect(res.status).toBe(201);
  pads = res.body.id as string;
  await tenantScope.run(scopeX, () =>
    provided.stock.move([
      {
        productId: pads,
        branchId: world.a.x1,
        qtyDelta: '100.000',
        unitCost: '600.00',
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
});

const list = (query: string) => as('managerX', X).get(`/v1/invoices?${query}`);

describe('ADR 0059 test 4: the list and the detail', () => {
  it("lists one customer's invoices newest first, with paid, due and the payment status", async () => {
    const party = await customer();
    const oldest = await invoice(party, '1', '1000.00');
    const middle = await invoice(party, '2');
    await pay(party, middle.id, '500.00');
    const newest = await invoice(party, '1');

    const res = await list(`partyId=${party}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const page = invoiceListResponseSchema.parse(res.body);
    expect(page.items.map((i) => [i.id, i.number, i.total, i.paid, i.due, i.paymentStatus])).toEqual([
      [newest.id, newest.number, '1000.00', '0.00', '1000.00', 'due'],
      [middle.id, middle.number, '2000.00', '500.00', '1500.00', 'partly_paid'],
      [oldest.id, oldest.number, '1000.00', '1000.00', '0.00', 'paid'],
    ]);
    expect(page.items.every((i) => i.partyId === party && i.status === 'posted')).toBe(true);
    expect(page.items[0]?.customerName).toBe('Invoice Read Customer');
  });

  it('pages with the cursor without skipping or repeating', async () => {
    const party = await customer();
    const made = [];
    for (let n = 0; n < 3; n += 1) made.push((await invoice(party, '1')).id);
    const first = invoiceListResponseSchema.parse((await list(`partyId=${party}&limit=2`)).body);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = invoiceListResponseSchema.parse(
      (await list(`partyId=${party}&limit=2&cursor=${first.nextCursor}`)).body,
    );
    expect([...first.items, ...second.items].map((i) => i.id)).toEqual([...made].reverse());
    expect(second.nextCursor).toBeNull();
  });

  it('the detail: lines and payments add up to the total and the paid amount; no cost anywhere', async () => {
    const party = await customer();
    const sale = await invoice(party, '3', '400.00');
    await pay(party, sale.id, '600.00');
    const res = await as('cashierX1', X).get(`/v1/invoices/${sale.id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
    const detail = invoiceDetailSchema.parse(res.body);
    expect(detail).toMatchObject({
      id: sale.id,
      total: '3000.00',
      paid: '1000.00',
      due: '2000.00',
      discount: '0.00',
    });
    expect(detail.lines).toEqual([
      { description: 'Brake shoe set, front', quantity: '3.000', unitPrice: '1000.00', amount: '3000.00' },
    ]);
    expect(detail.payments.map((p) => [p.amount, p.method])).toEqual([
      ['400.00', 'cash'],
      ['600.00', 'cash'],
    ]);
    expect(detail.soldBy.length).toBeGreaterThan(0);
  });
});

describe('ADR 0059 test 5: isolation', () => {
  it("Y gets 404 for X's invoice by id, the same as for a guessed id", async () => {
    const party = await customer();
    const sale = await invoice(party, '1');
    const fromY = await as('ownerB', Y).get(`/v1/invoices/${sale.id}`);
    const guessed = await as('managerX', X).get(`/v1/invoices/${randomUUID()}`);
    expect(fromY.status).toBe(404);
    expect(guessed.status).toBe(404);
    expect(fromY.body.code).toBe(guessed.body.code);
  });

  it("X's invoices never appear in Y's list, even when Y names X's customer", async () => {
    const party = await customer();
    const sale = await invoice(party, '1');
    const res = await as('ownerB', Y).get(`/v1/invoices?partyId=${party}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toEqual([]);
    const all = await as('ownerB', Y).get('/v1/invoices?limit=100');
    expect(JSON.stringify(all.body)).not.toContain(sale.id);
  });
});
