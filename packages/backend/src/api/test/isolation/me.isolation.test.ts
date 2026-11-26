import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import { myBusinessesResponseSchema } from '@erp/shared';
import request from 'supertest';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * GET /v1/me/businesses through HTTP against real Postgres (ADR 0060 tests): each signed-in user gets only the
 * businesses and branches their own scopes cover, in their own organization; X-Business-Id is ignored; no session is
 * a 401. Every value is invented (isolationWorld).
 */
interface World {
  a: { organizationId: string; x: string; x1: string; x2: string; x2a: string };
  b: { organizationId: string; y: string; y1: string };
  tokens: Record<'ownerA' | 'managerX' | 'branchManagerX1' | 'accountantX1' | 'cashierX1' | 'ownerB', string>;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set for the isolation suite (see .env.example).');

const world = inject('isolation') as unknown as World;
const { managers, tenantScope, provided, close } = createManagers({
  databaseUrl,
  version: 'test',
  dbPoolMax: 4,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const app = createApp({ logger: silentLogger, managers, tenantScope, idempotency: provided.idempotency });

afterAll(async () => {
  await close();
});

type Who = keyof World['tokens'];
const mine = (who: Who, headers: Record<string, string> = {}) =>
  request(app)
    .get('/v1/me/businesses')
    .set({ Cookie: `__Host-erp_sid=${world.tokens[who]}`, ...headers });

/** The answer as ids only: business id with its sorted branch ids. */
async function idsOf(who: Who, headers?: Record<string, string>) {
  const res = await mine(who, headers);
  expect(res.status).toBe(200);
  const body = myBusinessesResponseSchema.parse(res.body);
  return body.items.map((b) => ({ id: b.id, branches: b.branches.map((br) => br.id).sort() }));
}

describe('GET /v1/me/businesses (ADR 0060)', () => {
  it("organization A's Owner sees both of A's businesses and never organization B's", async () => {
    const list = await idsOf('ownerA');
    expect(list).toEqual(
      expect.arrayContaining([
        { id: world.a.x, branches: expect.arrayContaining([world.a.x1]) as unknown },
        { id: world.a.x2, branches: expect.arrayContaining([world.a.x2a]) as unknown },
      ]),
    );
    expect(list.map((b) => b.id)).not.toContain(world.b.y);
    expect(list.flatMap((b) => b.branches)).not.toContain(world.b.y1);
  });

  it("organization B's Owner sees only B's business", async () => {
    expect(await idsOf('ownerB')).toEqual([{ id: world.b.y, branches: [world.b.y1] }]);
  });

  it('a Business Manager of X sees only X; a Cashier of X1 sees X with only branch X1', async () => {
    expect((await idsOf('managerX')).map((b) => b.id)).toEqual([world.a.x]);
    expect(await idsOf('cashierX1')).toEqual([{ id: world.a.x, branches: [world.a.x1] }]);
  });

  it("ignores X-Business-Id: naming B's business changes nothing and is not a 404", async () => {
    expect(await idsOf('cashierX1', { 'X-Business-Id': world.b.y, 'X-Branch-Id': world.b.y1 })).toEqual([
      { id: world.a.x, branches: [world.a.x1] },
    ]);
  });

  it('answers only id, name and branches (id, name, shortCode): nothing else', async () => {
    const res = await mine('ownerB');
    const [business] = (res.body as { items: Record<string, unknown>[] }).items;
    expect(Object.keys(business ?? {}).sort()).toEqual(['branches', 'id', 'name']);
    const [branch] = (business?.branches ?? []) as Record<string, unknown>[];
    expect(Object.keys(branch ?? {}).sort()).toEqual(['id', 'name', 'shortCode']);
  });

  it('refuses a call without a session, or with an unknown one: 401', async () => {
    expect((await request(app).get('/v1/me/businesses')).status).toBe(401);
    const unknown = await request(app)
      .get('/v1/me/businesses')
      .set({ Cookie: '__Host-erp_sid=not-a-session' });
    expect(unknown.status).toBe(401);
  });

  it('is read-only: POST is not a route', async () => {
    const res = await request(app)
      .post('/v1/me/businesses')
      .set({ Cookie: `__Host-erp_sid=${world.tokens.ownerA}`, Origin: 'http://localhost:5173' })
      .send({});
    expect([404, 405]).toContain(res.status);
  });
});
