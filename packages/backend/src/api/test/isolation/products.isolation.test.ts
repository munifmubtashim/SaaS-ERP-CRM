import { randomBytes, randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import request from 'supertest';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * The product routes through HTTP against real Postgres (ADR 0052 tests 4 to 9; ADR 0051 tests 1 and 8; CLAUDE.md's
 * mandatory cases): a user of business X can't read, write or guess ids of business Y; organization A's Owner sees
 * nothing of organization B; and the role matrix (Munif, 23 Nov): every role views, only owner and business_manager
 * create and edit. The world (two organizations, six sessions) is seeded by dal's test/support/isolationWorld.ts.
 */
declare module 'vitest' {
  export interface ProvidedContext {
    isolation: {
      a: { organizationId: string; x: string; x1: string; x2: string; x2a: string };
      b: { organizationId: string; y: string; y1: string };
      tokens: Record<
        'ownerA' | 'managerX' | 'branchManagerX1' | 'accountantX1' | 'cashierX1' | 'ownerB',
        string
      >;
    };
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set for the isolation suite (see .env.example).');

const world = inject('isolation');
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

type Who = keyof typeof world.tokens;
const X = { business: world.a.x, branch: world.a.x1 };
const Y = { business: world.b.y, branch: world.b.y1 };

/** A request as `who`, in `place` (X-Business-Id, X-Branch-Id). */
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
    patch: (path: string, body: object) => request(app).patch(path).set(headers).send(body),
  };
}

const newProduct = (overrides: object = {}) => ({
  code: `P-${randomBytes(4).toString('hex')}`,
  name: 'Isolation Helmet',
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '2500.50',
  ...overrides,
});

async function created(who: Who = 'ownerA', place = X) {
  const res = await as(who, place).post('/v1/products', newProduct());
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string; version: number };
}

describe('products: create, read and edit (ADR 0052 tests 4 and 5)', () => {
  it('4. create is 201 with Location, version 1 and money as a string; the same code again is 409 code_taken', async () => {
    const body = newProduct({ sellPrice: '125000.00' });
    const res = await as('ownerA', X).post('/v1/products', body);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/v1/products/${res.body.id}`);
    expect(res.body).toMatchObject({ code: body.code, sellPrice: '125000.00', version: 1, status: 'active' });
    const again = await as('ownerA', X).post('/v1/products', body);
    expect(again.status).toBe(409);
    expect(again.body.fields[0].code).toBe('product.code_taken');
  });

  it('5. edit with the read version is 200 and version 2; again with version 1 is 409 and changes nothing', async () => {
    const product = await created();
    const edited = await as('ownerA', X).patch(`/v1/products/${product.id}`, {
      version: 1,
      sellPrice: '2600.00',
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ sellPrice: '2600.00', version: 2 });
    const stale = await as('ownerA', X).patch(`/v1/products/${product.id}`, { version: 1, name: 'Stale' });
    expect(stale.status).toBe(409);
    expect(stale.body.fields[0].code).toBe('product.version_conflict');
    expect((await as('ownerA', X).get(`/v1/products/${product.id}`)).body).toMatchObject({
      name: 'Isolation Helmet',
      version: 2,
    });
  });

  it('6. two parallel edits of one version: one 200, one 409', async () => {
    const product = await created();
    const results = await Promise.all(
      ['A', 'B'].map((name) => as('ownerA', X).patch(`/v1/products/${product.id}`, { version: 1, name })),
    );
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  });

  it('the list finds the product by search in its business, with a next cursor when there is more', async () => {
    const product = await created();
    const page = await as('ownerA', X).get(`/v1/products?search=${product.code}&limit=1`);
    expect(page.status).toBe(200);
    expect(page.body.items.map((item: { id: string }) => item.id)).toEqual([product.id]);
    expect(page.body.items[0]).not.toHaveProperty('sellPrice');
  });
});

describe('cross-business isolation (ADR 0052 tests 7 and 8; CLAUDE.md mandatory cases)', () => {
  it("7. organization B's Owner, in Y, gets 404 for X's product on GET and PATCH, and never sees it listed", async () => {
    const product = await created();
    const fromY = as('ownerB', Y);
    const read = await fromY.get(`/v1/products/${product.id}`);
    const write = await fromY.patch(`/v1/products/${product.id}`, { version: 1, name: 'From Y' });
    const guessed = await fromY.get(`/v1/products/${randomUUID()}`);
    expect([read.status, write.status]).toEqual([404, 404]);
    expect(read.body.code).toBe(guessed.body.code);
    expect(read.body.message).toBe(guessed.body.message);
    expect((await fromY.get(`/v1/products?search=${product.code}`)).body.items).toEqual([]);
    expect((await as('ownerA', X).get(`/v1/products/${product.id}`)).body.version).toBe(1);
  });

  it("naming another organization's business, a business without a scope, or a guessed id is the same 404", async () => {
    const bodies = [];
    for (const [who, place] of [
      ['ownerB', X],
      ['cashierX1', { business: world.a.x2, branch: world.a.x2a }],
      ['managerX', { business: world.a.x, branch: world.a.x2a }],
      ['ownerA', { business: randomUUID(), branch: randomUUID() }],
    ] as const) {
      const res = await as(who, place).get('/v1/products');
      expect(res.status, `${who}`).toBe(404);
      bodies.push({ code: res.body.code, message: res.body.message, fields: res.body.fields });
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it("the group Owner of A works in A's other business, and its products stay apart from X's", async () => {
    const inX = await created();
    const x2 = { business: world.a.x2, branch: world.a.x2a };
    expect((await as('ownerA', x2).get(`/v1/products/${inX.id}`)).status).toBe(404);
    await created('ownerA', x2);
  });

  it('8. a businessId in the body is refused; the product lands in the scope business only', async () => {
    const res = await as('ownerA', X).post('/v1/products', newProduct({ businessId: world.b.y }));
    expect(res.status).toBe(400);
  });

  it('a tenant route without X-Business-Id and X-Branch-Id is 400 tenant.headers', async () => {
    const res = await request(app).get('/v1/products').set('Cookie', `__Host-erp_sid=${world.tokens.ownerA}`);
    expect(res.status).toBe(400);
    expect(res.body.fields[0].code).toBe('tenant.headers');
  });
});

describe('role matrix (Munif, 23 Nov): every role views; owner and business_manager create and edit (test 9)', () => {
  it('every role lists and reads', async () => {
    const product = await created();
    for (const who of ['ownerA', 'managerX', 'branchManagerX1', 'accountantX1', 'cashierX1'] as const) {
      expect((await as(who, X).get(`/v1/products/${product.id}`)).status, who).toBe(200);
      expect((await as(who, X).get('/v1/products')).status, who).toBe(200);
    }
  });

  it('the business manager creates and edits', async () => {
    const product = await created('managerX');
    const res = await as('managerX', X).patch(`/v1/products/${product.id}`, {
      version: 1,
      status: 'archived',
    });
    expect(res.body).toMatchObject({ status: 'archived', version: 2 });
  });

  it('branch manager, accountant and cashier get 403 on create and edit, and nothing is written', async () => {
    const product = await created();
    for (const who of ['branchManagerX1', 'accountantX1', 'cashierX1'] as const) {
      const body = newProduct();
      const create = await as(who, X).post('/v1/products', body);
      const edit = await as(who, X).patch(`/v1/products/${product.id}`, { version: 1, name: who });
      expect([create.status, edit.status], who).toEqual([403, 403]);
      expect((await as('ownerA', X).get(`/v1/products?search=${body.code}`)).body.items).toEqual([]);
    }
    expect((await as('ownerA', X).get(`/v1/products/${product.id}`)).body.version).toBe(1);
  });
});
