import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import type { TenantScope } from '@erp/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * GET /v1/stock (#34's stockRowSchema, for the inventory page) and GET /v1/stock/pos-catalog (#198, for the POS)
 * through HTTP against real Postgres (Munif, 24 Nov): every role may read; quantities and money are strings; no cost
 * ever; the catalog carries the business's walk-in party; business Y sees none of X's stock; a bad cursor is 400.
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
    post: (path: string, body: object) => request(app).post(path).set(headers).send(body),
  };
}

const code = `STK-${randomBytes(4).toString('hex')}`;
let part: string;

beforeAll(async () => {
  const res = await as('ownerA', X).post('/v1/products', {
    code,
    name: 'Engine oil, 1 litre',
    unit: 'bottle',
    tracking: 'quantity',
    sellPrice: '450.00',
  });
  part = res.body.id;
  await tenantScope.run(scopeX, () =>
    provided.stock.move([
      {
        productId: part,
        branchId: world.a.x1,
        qtyDelta: '7.000',
        unitCost: '300.00',
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
});

describe('GET /v1/stock (the inventory page)', () => {
  it('every role reads the row: on hand as a string, the branch named, no cost', async () => {
    for (const who of ['ownerA', 'managerX', 'branchManagerX1', 'accountantX1', 'cashierX1'] as const) {
      const res = await as(who, X).get(`/v1/stock?search=${code}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([
        {
          productId: part,
          productCode: code,
          productName: 'Engine oil, 1 litre',
          branchId: world.a.x1,
          branchName: expect.any(String),
          onHand: '7.000',
        },
      ]);
      expect(res.body.nextCursor).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
    }
  });

  it('a malformed cursor is 400 page.cursor_invalid', async () => {
    const res = await as('ownerA', X).get('/v1/stock?cursor=not-a-cursor');
    expect(res.status).toBe(400);
    expect(res.body.fields[0].code).toBe('page.cursor_invalid');
  });

  it("organization B's Owner, in Y, never sees X's stock; naming X is 404", async () => {
    expect((await as('ownerB', Y).get(`/v1/stock?search=${code}`)).body.items).toEqual([]);
    expect((await as('ownerB', X).get('/v1/stock')).status).toBe(404);
  });
});

describe('GET /v1/stock/pos-catalog (the POS)', () => {
  it("the cashier gets the item with its price and on hand, and the business's walk-in party; no cost", async () => {
    const res = await as('cashierX1', X).get('/v1/stock/pos-catalog');
    expect(res.status).toBe(200);
    expect(res.body.walkInPartyId).toBe(world.sales.walkInX);
    expect(res.body.items.find((i: { productId: string }) => i.productId === part)).toEqual({
      productId: part,
      code,
      name: 'Engine oil, 1 litre',
      unit: 'bottle',
      tracking: 'quantity',
      sellPrice: '450.00',
      isPassThrough: false,
      onHand: '7.000',
      units: [],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
  });

  it("organization B's catalog never lists X's product, and its walk-in is not X's", async () => {
    const res = await as('ownerB', Y).get('/v1/stock/pos-catalog');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { productId: string }) => i.productId)).not.toContain(part);
    expect(res.body.walkInPartyId).not.toBe(world.sales.walkInX);
  });
});
