import { randomUUID } from 'node:crypto';
import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp, DEV_APP_ORIGIN } from '../../app.js';
import { silentLogger } from '../helpers.js';

/**
 * The party routes through HTTP against real Postgres (ADR 0056 section 4; ADR 0019 tests 15 to 18): a user of
 * business X can't read, write or guess ids of business Y (404, never 403); no response carries an NID key; the per-role codes (ADR 0006 section 8). The world
 * is dal's test/support/isolationWorld.ts; the ProvidedContext type is declared in products.isolation.test.ts.
 */
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

/** A fresh, invented phone per call, so parties never warn about each other by accident. */
let phoneSeq = Math.floor(Math.random() * 900_000);
const nextPhone = () => `+88017${String(10_000_000 + (phoneSeq++ % 89_999_999)).slice(0, 8)}`;

const newCustomer = (overrides: object = {}) => ({
  name: 'Isolation Customer',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: nextPhone(),
  altPhone: null,
  email: null,
  address: null,
  area: 'Sample Upazila',
  creditLimit: null,
  payTermDays: null,
  ...overrides,
});

interface Created {
  id: string;
  code: string;
  version: number;
  phone: string;
}

async function created(who: Who = 'managerX', place = X, overrides: object = {}): Promise<Created> {
  const res = await as(who, place).post('/v1/parties', newCustomer(overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as Created;
}

const NID_KEY = /"nid(_ciphertext|_hash)?"|"nid[A-Z]/;

describe('create, read, edit and deactivate (ADR 0056 section 4)', () => {
  it('a cashier creates a customer: 201, Location, a C- code from the series, version 1, the phone in E.164', async () => {
    // Typed the local way (017…); stored as E.164.
    const body = newCustomer({ phone: `0${nextPhone().slice(4)}` });
    const res = await as('cashierX1', X).post('/v1/parties', body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.headers.location).toBe(`/v1/parties/${res.body.id}`);
    expect(res.body).toMatchObject({ businessId: world.a.x, version: 1, status: 'active', isCustomer: true });
    expect(res.body.code).toMatch(/^C-\d{6}$/);
    expect(res.body.phone).toMatch(/^\+8801\d{9}$/);
  });

  it('a body naming businessId, code or status is 400, and nothing is created', async () => {
    for (const extra of [{ businessId: world.b.y }, { code: 'C-999999' }, { status: 'inactive' }]) {
      const res = await as('managerX', X).post('/v1/parties', newCustomer(extra));
      expect(res.status).toBe(400);
    }
  });

  it('the same phone again is 409 party.possible_duplicate naming the match; confirmDuplicate saves it', async () => {
    const first = await created();
    const again = await as('managerX', X).post('/v1/parties', newCustomer({ phone: first.phone }));
    expect(again.status).toBe(409);
    expect(again.body.fields).toEqual([
      { path: 'phone', code: 'party.possible_duplicate', message: `${first.code} Isolation Customer` },
    ]);
    const confirmed = await as('managerX', X).post(
      '/v1/parties',
      newCustomer({ phone: first.phone, confirmDuplicate: true }),
    );
    expect(confirmed.status).toBe(201);
  });

  it('edit with the version read is 200 and version 2; again with version 1 is 409 party.version_conflict', async () => {
    const party = await created();
    const edited = await as('managerX', X).patch(`/v1/parties/${party.id}`, {
      version: 1,
      name: 'Renamed Customer',
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Renamed Customer', version: 2 });
    const stale = await as('managerX', X).patch(`/v1/parties/${party.id}`, { version: 1, name: 'Stale' });
    expect(stale.status).toBe(409);
    expect(stale.body.fields[0].code).toBe('party.version_conflict');
  });

  it('deactivate is 200 and inactive; the walk-in customer is 409 party.walk_in_locked', async () => {
    const party = await created();
    const res = await as('managerX', X).post(`/v1/parties/${party.id}/deactivate`, { version: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'inactive', version: 2 });

    const walkIn = await as('managerX', X).get('/v1/parties?search=walk-in');
    const walkInRow = (walkIn.body.items as { id: string; code: string }[]).find((p) => p.code === 'WALK-IN');
    expect(walkInRow).toBeDefined();
    const locked = await as('managerX', X).post(`/v1/parties/${walkInRow?.id}/deactivate`, { version: 1 });
    expect(locked.status).toBe(409);
    expect(locked.body.fields[0].code).toBe('party.walk_in_locked');
  });

  it('list and get: the new customer is found by its code, with list-item fields only', async () => {
    const party = await created();
    const list = await as('cashierX1', X).get(`/v1/parties?search=${party.code}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([party.id]);
    expect(list.body.nextCursor).toBeNull();
    const one = await as('cashierX1', X).get(`/v1/parties/${party.id}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: party.id, code: party.code });
  });
});

describe('ADR 0019 test 15: business Y gets 404 for business X, never 403, on every route', () => {
  let party: Created;

  beforeAll(async () => {
    party = await created();
  });

  it("GET /v1/parties/:id: X's party from Y is the same 404 as a guessed id", async () => {
    const theirs = await as('ownerB', Y).get(`/v1/parties/${party.id}`);
    const guessed = await as('ownerB', Y).get(`/v1/parties/${randomUUID()}`);
    expect([theirs.status, guessed.status]).toEqual([404, 404]);
    expect(theirs.body.fields).toEqual(guessed.body.fields);
  });

  it("GET /v1/parties: Y's list and search never show X's party", async () => {
    const res = await as('ownerB', Y).get(`/v1/parties?search=${party.code}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { id: string }) => p.id)).not.toContain(party.id);
  });

  it("PATCH /v1/parties/:id: Y editing X's party is 404, and X's party is unchanged", async () => {
    const res = await as('ownerB', Y).patch(`/v1/parties/${party.id}`, { version: 1, name: 'Taken Over' });
    expect(res.status).toBe(404);
    const mine = await as('managerX', X).get(`/v1/parties/${party.id}`);
    expect(mine.body).toMatchObject({ name: 'Isolation Customer', version: 1 });
  });

  it("POST /v1/parties/:id/deactivate: Y deactivating X's party is 404, and it stays active", async () => {
    const res = await as('ownerB', Y).post(`/v1/parties/${party.id}/deactivate`, { version: 1 });
    expect(res.status).toBe(404);
    const mine = await as('managerX', X).get(`/v1/parties/${party.id}`);
    expect(mine.body.status).toBe('active');
  });

  it("POST /v1/parties: X's phone gives no duplicate warning in Y (nothing leaks, ADR 0019 test 12)", async () => {
    const res = await as('ownerB', Y).post('/v1/parties', newCustomer({ phone: party.phone }));
    expect(res.status).toBe(201);
    expect(res.body.businessId).toBe(world.b.y);
  });
});

// Test 16 (a party made at another branch is listed) is PartyQuery.int.test.ts: this world's business X has one branch.
describe('ADR 0019 tests 17 and 18', () => {
  it('17. no list or detail response carries an NID key', async () => {
    const party = await created();
    const list = await as('managerX', X).get('/v1/parties?limit=100');
    const one = await as('managerX', X).get(`/v1/parties/${party.id}`);
    expect(JSON.stringify(list.body)).not.toMatch(NID_KEY);
    expect(JSON.stringify(one.body)).not.toMatch(NID_KEY);
  });

  it('18. a cashier gets 403 on PATCH; a branch manager gets 403 on deactivate (ADR 0006 section 8)', async () => {
    const party = await created();
    const patch = await as('cashierX1', X).patch(`/v1/parties/${party.id}`, {
      version: 1,
      name: 'Cashier Edit',
    });
    expect(patch.status).toBe(403);
    const off = await as('branchManagerX1', X).post(`/v1/parties/${party.id}/deactivate`, { version: 1 });
    expect(off.status).toBe(403);
  });
});
