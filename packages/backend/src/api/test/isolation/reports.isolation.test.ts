import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import { formatMoney, parseMoney, subtractMoney, type TenantScope } from '@erp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * GET /v1/reports/owner-dashboard through HTTP against real Postgres (ADR 0023 tests 1, 3 and 9, amended 24 Nov): the
 * figures move with a real sale exactly as the ledger does; Owner and Business Manager may read it, nobody else;
 * organization B never sees A's business; stock value comes back for callers with product.cost.view. Other files
 * post in business X too, so the test measures the change around its own sale, not absolute figures.
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

function as(who: Who, place: { business: string; branch: string }) {
  const headers = {
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

const dashboard = (who: Who = 'ownerA', place = X) => as(who, place).get('/v1/reports/owner-dashboard');
const diff = (after: string, before: string) =>
  formatMoney(subtractMoney(parseMoney(after), parseMoney(before)));

let part: string;

beforeAll(async () => {
  const res = await as('ownerA', X).post('/v1/products', {
    code: `P-${randomBytes(4).toString('hex')}`,
    name: 'Brake pad set, front, 150 cc',
    unit: 'pcs',
    tracking: 'quantity',
    sellPrice: '1000.00',
  });
  part = res.body.id;
  await tenantScope.run(scopeX, () =>
    provided.stock.move([
      {
        productId: part,
        branchId: world.a.x1,
        qtyDelta: '5.000',
        unitCost: '700.00',
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
});

describe('GET /v1/reports/owner-dashboard: the figures follow the ledger (ADR 0023 test 1)', () => {
  it('a sale of ৳2,000.00 with ৳500.00 paid in cash: dues +1,500, collections +500, revenue +2,000, stock -1,400', async () => {
    const before = await dashboard();
    expect(before.status).toBe(200);
    const sale = await as('cashierX1', X).post('/v1/invoices', {
      partyId: world.sales.customerX,
      customerName: 'Rahim Uddin',
      lines: [{ productId: part, serialUnitId: null, qty: '2' }],
      discount: '0.00',
      payments: [{ method: 'cash', amount: '500.00', externalRef: null }],
    });
    expect(sale.status).toBe(201);
    const after = await dashboard();
    const [b, a] = [before.body.totals, after.body.totals];
    expect({
      dues: diff(a.dues, b.dues),
      collectionsToday: diff(a.collectionsToday, b.collectionsToday),
      revenueMonth: diff(a.revenueMonth, b.revenueMonth),
      stockValue: diff(a.stockValue, b.stockValue),
    }).toEqual({
      dues: '1500.00',
      collectionsToday: '500.00',
      revenueMonth: '2000.00',
      stockValue: '-1400.00',
    });
    // The totals are the sum of the rows; here, the one business in scope.
    expect(after.body.businesses).toHaveLength(1);
    expect(after.body.businesses[0]).toMatchObject({ businessId: world.a.x, ...a });
  });
});

describe('who may read it (ADR 0023 section 2; D-03)', () => {
  it('Owner and Business Manager: 200 with money as strings and stock value (they hold product.cost.view)', async () => {
    for (const who of ['ownerA', 'managerX'] as const) {
      const res = await dashboard(who);
      expect(res.status).toBe(200);
      for (const value of Object.values(res.body.totals)) expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it('Accountant, Branch Manager and Cashier: 403', async () => {
    for (const who of ['accountantX1', 'branchManagerX1', 'cashierX1'] as const) {
      expect((await dashboard(who)).status).toBe(403);
    }
  });
});

describe('cross-organization isolation (ADR 0023 test 3; CLAUDE.md mandatory cases)', () => {
  it("organization B's Owner sees only Y; naming X is the same 404 as a guessed business", async () => {
    const own = await dashboard('ownerB', Y);
    expect(own.status).toBe(200);
    expect(own.body.businesses.map((b: { businessId: string }) => b.businessId)).toEqual([world.b.y]);
    const named = await dashboard('ownerB', X);
    const guessed = await dashboard('ownerB', { business: randomUUID(), branch: randomUUID() });
    expect([named.status, guessed.status]).toEqual([404, 404]);
    expect(named.body.message).toBe(guessed.body.message);
  });
});
