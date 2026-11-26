import type { TenantScope } from '@erp/shared';
import { IdempotencyGuard, type IIdempotencyQuery, type StoredKey } from '@erp/business-logic';
import express, { type Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { HttpResult } from '../../controllers/BaseController.js';
import type { ITenantScopeRunner } from '../../controllers/contracts/index.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { createRouteWrappers } from '../../routes/tenantRoute.js';

/**
 * ADR 0014 tests 8, 10 and 11 (and ADR 0011 test 3) for the tenant wrapper's `{ idempotent: true }` option, with the
 * real IdempotencyGuard (#96) over an in-memory key store that rolls back with the fake transaction. The database
 * half (claims wait, answers stored once) is IdempotencyQuery.int.test.ts (#122).
 */
const scope: TenantScope = {
  organizationId: '0196f000-0000-7000-8000-00000000000a',
  businessIds: ['0196f000-0000-7000-8000-0000000000a1'],
  branchIds: ['0196f000-0000-7000-8000-0000000001a1'],
};
const USER = '0196f000-0000-7000-8000-0000000000b1';

/** In-memory key records, keyed like the table: one per key in the business. */
class MemoryKeys implements IIdempotencyQuery {
  rows = new Map<string, Omit<StoredKey, 'statusCode'> & { statusCode: number | null }>();
  async claim(input: { key: string; route: string; userId: string; requestHash: Buffer }) {
    const row = this.rows.get(input.key);
    if (row) return row as StoredKey;
    this.rows.set(input.key, { ...input, statusCode: null, responseBody: null, responseHeaders: {} });
    return null;
  }
  async complete(key: string, statusCode: number, body: unknown, headers: Record<string, string>) {
    const row = this.rows.get(key);
    if (!row || row.statusCode !== null) throw new Error('not claimed, or already stored');
    Object.assign(row, { statusCode, responseBody: body, responseHeaders: headers });
  }
}

/** A transaction over MemoryKeys: a thrown handler rolls the key store back, as Postgres would. */
class MemoryRunner implements ITenantScopeRunner {
  constructor(private readonly keys: MemoryKeys) {}
  async run<T>(_scope: TenantScope, fn: () => Promise<T>): Promise<T> {
    const before = new Map([...this.keys.rows].map(([k, v]) => [k, { ...v }]));
    try {
      return await fn();
    } catch (error) {
      this.keys.rows = before;
      throw error;
    }
  }
}

function setup(handler: (req: Request) => Promise<HttpResult>) {
  const keys = new MemoryKeys();
  const wrap = createRouteWrappers(new MemoryRunner(keys), new IdempotencyGuard(keys));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = scope;
    req.auth = {
      userId: req.get('x-test-user') ?? USER,
      organizationId: scope.organizationId,
      sessionId: USER,
      roles: ['owner'],
      permissions: [],
    };
    next();
  });
  app.post('/v1/payments', wrap.tenant(handler, { idempotent: true, roles: ['owner'] }));
  app.post('/v1/notes', wrap.tenant(handler, { roles: ['owner'] }));
  app.post('/v1/invoices/:id/post', wrap.tenant(handler, { idempotent: true, roles: ['owner'] }));
  app.use(errorMiddleware);
  return { app, keys };
}

/** A handler that counts its runs and answers 201 with a Location header. */
function counting() {
  const calls: unknown[] = [];
  const handler = async (req: Request): Promise<HttpResult> => {
    calls.push(req.body);
    return {
      status: 201,
      body: { id: `p${calls.length}` },
      headers: { Location: `/v1/payments/p${calls.length}` },
    };
  };
  return { calls, handler };
}

const post = (
  app: express.Express,
  path: string,
  key: string | null,
  body: object = { amount: '100.00' },
) => {
  const req = request(app).post(path).send(body);
  return key ? req.set('Idempotency-Key', key) : req;
};

describe('wrap.tenant(handler, { idempotent: true }) (ADR 0014 section 2)', () => {
  it('8. the same key twice runs the handler once; the second answer is identical, with Idempotent-Replayed', async () => {
    const { calls, handler } = counting();
    const { app } = setup(handler);
    const first = await post(app, '/v1/payments', 'key-1');
    const second = await post(app, '/v1/payments', 'key-1');
    expect(calls).toHaveLength(1);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body).toEqual(first.body);
    expect(second.headers.location).toBe('/v1/payments/p1');
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(second.headers['idempotent-replayed']).toBe('true');
  });

  it('ADR 0011 test 3: the same key with another body, or from another user, is 409 key_reused and runs nothing', async () => {
    const { calls, handler } = counting();
    const { app } = setup(handler);
    await post(app, '/v1/payments', 'key-2');
    const otherBody = await post(app, '/v1/payments', 'key-2', { amount: '999.00' });
    const otherUser = await post(app, '/v1/payments', 'key-2').set(
      'x-test-user',
      '0196f000-0000-7000-8000-0000000000b2',
    );
    for (const res of [otherBody, otherUser]) {
      expect(res.status).toBe(409);
      expect(res.body.fields[0].code).toBe('idempotency.key_reused');
    }
    expect(calls).toHaveLength(1);
  });

  it('10. a missing or malformed key on an idempotent route is 400 idempotency.missing and runs nothing', async () => {
    const { calls, handler } = counting();
    const { app } = setup(handler);
    for (const res of [await post(app, '/v1/payments', null), await post(app, '/v1/payments', 'has space')]) {
      expect(res.status).toBe(400);
      expect(res.body.fields[0].code).toBe('idempotency.missing');
    }
    expect(calls).toHaveLength(0);
  });

  it('10. on a route without the option the key is ignored: each request runs, nothing is stored', async () => {
    const { calls, handler } = counting();
    const { app, keys } = setup(handler);
    await post(app, '/v1/notes', 'key-3');
    await post(app, '/v1/notes', 'key-3');
    expect(calls).toHaveLength(2);
    expect(keys.rows.size).toBe(0);
  });

  it('11. a handler that throws leaves no key behind; the retry with the same key runs and succeeds', async () => {
    let fail = true;
    const { app, keys } = setup(async () => {
      if (fail) throw new Error('posting failed');
      return { status: 201, body: { id: 'p1' } };
    });
    expect((await post(app, '/v1/payments', 'key-4')).status).toBe(500);
    expect(keys.rows.size).toBe(0);
    fail = false;
    const retry = await post(app, '/v1/payments', 'key-4');
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
  });

  it('an idempotent route is refused when built read-only, or without the guard', () => {
    const handler = counting().handler;
    expect(() =>
      createRouteWrappers(new MemoryRunner(new MemoryKeys()), new IdempotencyGuard(new MemoryKeys())).tenant(
        handler,
        {
          idempotent: true,
          readOnly: true,
          roles: ['owner'],
        },
      ),
    ).toThrow(/cannot be read-only/);
    expect(() =>
      createRouteWrappers(new MemoryRunner(new MemoryKeys())).tenant(handler, {
        idempotent: true,
        roles: ['owner'],
      }),
    ).toThrow(/needs the idempotency guard/);
  });

  it('the same key on another invoice id (same route pattern, empty body) is 409 key_reused, not a replay', async () => {
    const { calls, handler } = counting();
    const { app } = setup(handler);
    const first = await request(app).post('/v1/invoices/inv-a/post').set('Idempotency-Key', 'key-5');
    const other = await request(app).post('/v1/invoices/inv-b/post').set('Idempotency-Key', 'key-5');
    expect(first.status).toBe(201);
    expect(other.status).toBe(409);
    expect(other.body.fields[0].code).toBe('idempotency.key_reused');
    expect(calls).toHaveLength(1);
    const repeat = await request(app).post('/v1/invoices/inv-a/post').set('Idempotency-Key', 'key-5');
    expect(repeat.headers['idempotent-replayed']).toBe('true');
  });
});
