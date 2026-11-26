import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import type { TenantScope } from '@erp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * POST /v1/payments through HTTP against real Postgres (ADR 0057 section 5; ADR 0026 tests 1 to 4, 6, 9 and 10). Each
 * test makes its own customer (POST /v1/parties) and its own invoice (POST /v1/invoices), so balances read from the
 * ledger (Accounting's IPartyLedger) move only by what the test does. The world is dal's test/support/isolationWorld.ts.
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

function as(who: Who, place: Place | { business: string }, key: string | null = randomUUID()) {
  const headers: Record<string, string> = {
    Cookie: `__Host-erp_sid=${world.tokens[who]}`,
    Origin: DEV_APP_ORIGIN,
    'X-Business-Id': place.business,
  };
  if ('branch' in place) headers['X-Branch-Id'] = place.branch;
  if (key) headers['Idempotency-Key'] = key;
  return { post: (path: string, body: object) => request(app).post(path).set(headers).send(body) };
}

let phoneSeq = Math.floor(Math.random() * 80_000_000);
const nextPhone = () => `+88018${String(10_000_000 + (phoneSeq++ % 89_999_999)).slice(0, 8)}`;

/** A fresh customer of X, through the party route. */
async function customer(): Promise<string> {
  const res = await as('managerX', X, null).post('/v1/parties', {
    name: 'Payment Test Customer',
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

/** A posted invoice of 1,000.00 per pad for `partyId`, nothing paid at the sale: the due is the total. */
async function invoice(partyId: string, qty = '1'): Promise<string> {
  const res = await as('cashierX1', X).post('/v1/invoices', {
    partyId,
    customerName: 'Payment Test Customer',
    lines: [{ productId: pads, serialUnitId: null, qty }],
    discount: '0.00',
    payments: [],
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

const cash = (partyId: string, invoiceId: string | null, amount: string, fields: object = {}) => ({
  partyId,
  invoiceId,
  method: 'cash',
  amount,
  externalRef: null,
  note: null,
  ...fields,
});

const balances = (partyId: string) => tenantScope.run(scopeX, () => provided.partyLedger.balances(partyId));

beforeAll(async () => {
  const res = await as('ownerA', X, null).post('/v1/products', {
    code: `P-${randomBytes(4).toString('hex')}`,
    name: 'Brake pad set, rear, 125 cc',
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
        qtyDelta: '200.000',
        unitCost: '600.00',
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
});

describe('ADR 0026 test 1: one payment per Idempotency-Key', () => {
  it('the same key and body replays the first answer: one payment, one receipt, one journal', async () => {
    const party = await customer();
    const inv = await invoice(party);
    const key = randomUUID();
    const first = await as('cashierX1', X, key).post('/v1/payments', cash(party, inv, '400.00'));
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({
      partyId: party,
      invoiceId: inv,
      branchId: world.a.x1,
      method: 'cash',
      amount: '400.00',
      status: 'posted',
      note: null,
    });
    expect(first.body.receiptNumber).toEqual(expect.any(String));
    const again = await as('cashierX1', X, key).post('/v1/payments', cash(party, inv, '400.00'));
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect((await balances(party)).receivable).toBe('600.00');
  });

  it('the same key with another body is 409 idempotency.key_reused, and nothing more is paid', async () => {
    const party = await customer();
    const inv = await invoice(party);
    const key = randomUUID();
    expect((await as('cashierX1', X, key).post('/v1/payments', cash(party, inv, '100.00'))).status).toBe(201);
    const other = await as('cashierX1', X, key).post('/v1/payments', cash(party, inv, '200.00'));
    expect(other.status).toBe(409);
    expect(other.body.fields[0].code).toBe('idempotency.key_reused');
    expect((await balances(party)).receivable).toBe('900.00');
  });
});

describe('ADR 0026 test 2: the branch', () => {
  it('without X-Branch-Id the payment is 400, and nothing is paid', async () => {
    const party = await customer();
    const inv = await invoice(party);
    const res = await as('cashierX1', { business: world.a.x }).post(
      '/v1/payments',
      cash(party, inv, '100.00'),
    );
    expect(res.status).toBe(400);
    expect((await balances(party)).receivable).toBe('1000.00');
  });

  it('a cashier of X1 naming branch X2a is refused before anything runs', async () => {
    const res = await as('cashierX1', { business: world.a.x2, branch: world.a.x2a }).post(
      '/v1/payments',
      cash(world.sales.customerX, null, '100.00'),
    );
    expect([403, 404]).toContain(res.status);
  });
});

describe('ADR 0026 test 3 and ADR 0057 section 4: partial payments and the due', () => {
  it('three partials get consecutive receipts; a fourth above the due, and one on a paid invoice, are 409', async () => {
    const party = await customer();
    const inv = await invoice(party);
    const receipts: string[] = [];
    for (const amount of ['300.00', '300.00', '300.00']) {
      const res = await as('cashierX1', X).post('/v1/payments', cash(party, inv, amount));
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      receipts.push(res.body.receiptNumber as string);
    }
    const digits = receipts.map((r) => Number(/(\d+)$/.exec(r)?.[1]));
    expect(digits).toEqual([digits[0], (digits[0] ?? 0) + 1, (digits[0] ?? 0) + 2]);

    const above = await as('cashierX1', X).post('/v1/payments', cash(party, inv, '100.01'));
    expect(above.status).toBe(409);
    expect(above.body.fields[0].code).toBe('payment.exceeds_due');

    expect((await as('cashierX1', X).post('/v1/payments', cash(party, inv, '100.00'))).status).toBe(201);
    const paidUp = await as('cashierX1', X).post('/v1/payments', cash(party, inv, '0.01'));
    expect(paidUp.status).toBe(409);
    expect(paidUp.body.fields[0].code).toBe('payment.exceeds_due');
    expect((await balances(party)).receivable).toBe('0.00');
  });
});

describe('ADR 0026 test 4: the external transaction id', () => {
  it.each(['bank', 'bkash', 'card'])('%s without one is 400', async (method) => {
    const party = await customer();
    const inv = await invoice(party);
    const res = await as('cashierX1', X).post('/v1/payments', cash(party, inv, '100.00', { method }));
    expect(res.status).toBe(400);
  });

  it('cash is accepted without one; bKash with one is stored', async () => {
    const party = await customer();
    const inv = await invoice(party);
    expect((await as('cashierX1', X).post('/v1/payments', cash(party, inv, '100.00'))).status).toBe(201);
    const ref = `BK${randomBytes(4).toString('hex').toUpperCase()}`;
    const bkash = await as('cashierX1', X).post(
      '/v1/payments',
      cash(party, inv, '100.00', { method: 'bkash', externalRef: ref, note: 'Paid at the counter' }),
    );
    expect(bkash.status).toBe(201);
    expect(bkash.body).toMatchObject({ method: 'bkash', externalRef: ref, note: 'Paid at the counter' });
  });
});

describe('ADR 0026 test 6: an advance is a liability, never revenue', () => {
  it('a payment with no invoice raises the customer advance and leaves the receivable alone', async () => {
    const party = await customer();
    const res = await as('cashierX1', X).post('/v1/payments', cash(party, null, '2500.00'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.invoiceId).toBeNull();
    expect(await balances(party)).toEqual({ receivable: '0.00', customerAdvance: '2500.00' });
  });

  it('an advance for the walk-in customer is refused', async () => {
    const res = await as('cashierX1', X).post('/v1/payments', cash(world.sales.walkInX, null, '100.00'));
    expect(res.status).toBe(409);
    expect(res.body.fields[0].code).toBe('payment.walk_in_advance');
  });
});

describe('ADR 0026 test 9: business Y gets 404 for X', () => {
  it("paying X's invoice or naming X's customer from Y is 404, and X's due is unchanged", async () => {
    const party = await customer();
    const inv = await invoice(party);
    const onInvoice = await as('ownerB', Y).post('/v1/payments', cash(world.sales.customerY, inv, '100.00'));
    const onParty = await as('ownerB', Y).post('/v1/payments', cash(party, null, '100.00'));
    expect([onInvoice.status, onParty.status]).toEqual([404, 404]);
    expect((await balances(party)).receivable).toBe('1000.00');
  });
});

describe('ADR 0026 test 10: two payments on the last due', () => {
  it('two parallel payments of the whole due: one is 201, the other 409 payment.exceeds_due', async () => {
    const party = await customer();
    const inv = await invoice(party);
    const [a, b] = await Promise.all([
      as('cashierX1', X).post('/v1/payments', cash(party, inv, '1000.00')),
      as('cashierX1', X).post('/v1/payments', cash(party, inv, '1000.00')),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)?.body.fields[0].code).toBe('payment.exceeds_due');
    expect((await balances(party)).receivable).toBe('0.00');
  });
});
