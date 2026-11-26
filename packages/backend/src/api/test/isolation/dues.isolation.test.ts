import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import { customerDuesSchema, type TenantScope } from '@erp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { openDuesTotal } from '../duesTotal.js';
import { silentLogger } from '../helpers.js';

/**
 * F5, GET /v1/parties/:id/dues, through HTTP against real Postgres (ADR 0059 section 1 and its tests 1 to 3; ADR 0026
 * test 7). Each test makes its own customer, invoices and payments through the routes, so the ledger's balances for that
 * customer move only by what the test does. The world is dal's test/support/isolationWorld.ts.
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
const nextPhone = () => `+88019${String(10_000_000 + (phoneSeq++ % 89_999_999)).slice(0, 8)}`;

async function customer(): Promise<string> {
  const res = await as('managerX', X).post('/v1/parties', {
    name: 'Dues Test Customer',
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
    customerName: 'Dues Test Customer',
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

const balances = (partyId: string) => tenantScope.run(scopeX, () => provided.partyLedger.balances(partyId));

beforeAll(async () => {
  const res = await as('ownerA', X).post('/v1/products', {
    code: `D-${randomBytes(4).toString('hex')}`,
    name: 'Clutch cable, 150 cc',
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

describe('ADR 0059 test 1: the ledger total and the documents agree', () => {
  it('totals from the ledger, open invoices oldest first with paid and due, the paid one absent', async () => {
    const party = await customer();
    const first = await invoice(party, '1');
    await pay(party, first.id, '400.00');
    const second = await invoice(party, '2');
    await invoice(party, '1', '1000.00');
    await pay(party, null, '300.00');

    const res = await as('managerX', X).get(`/v1/parties/${party}/dues`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const dues = customerDuesSchema.parse(res.body);
    const ledger = await balances(party);
    expect(dues.totalDue).toBe(ledger.receivable);
    expect(dues.advance).toBe(ledger.customerAdvance);
    expect(dues).toMatchObject({ partyId: party, totalDue: '2600.00', advance: '300.00' });
    expect(dues.openInvoices.map((i) => [i.invoiceId, i.invoiceNumber, i.total, i.paid, i.due])).toEqual([
      [first.id, first.number, '1000.00', '400.00', '600.00'],
      [second.id, second.number, '2000.00', '0.00', '2000.00'],
    ]);
    expect(openDuesTotal(dues)).toBe(dues.totalDue);
  });
});

describe('ADR 0059 test 2: isolation', () => {
  it("business Y gets 404 for X's customer's dues, the same as for a guessed id", async () => {
    const party = await customer();
    const fromY = await as('ownerB', Y).get(`/v1/parties/${party}/dues`);
    const guessed = await as('managerX', X).get(`/v1/parties/${randomUUID()}/dues`);
    expect(fromY.status).toBe(404);
    expect(guessed.status).toBe(404);
    expect(fromY.body.code).toBe(guessed.body.code);
    expect(JSON.stringify(fromY.body)).not.toContain('Dues Test Customer');
  });
});

describe('ADR 0059 test 3', () => {
  it('the walk-in customer answers zero with no open invoices', async () => {
    const res = await as('managerX', X).get(`/v1/parties/${world.sales.walkInX}/dues`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ totalDue: '0.00', openInvoices: [] });
  });

  it('a cashier, who may view customers, reads dues', async () => {
    const party = await customer();
    await invoice(party, '1');
    const res = await as('cashierX1', X).get(`/v1/parties/${party}/dues`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.totalDue).toBe('1000.00');
  });
});
