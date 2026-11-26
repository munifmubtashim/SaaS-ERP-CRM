import type { TenantScope } from '@erp/shared';
import { AppError } from '@erp/shared';
import express, { type Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { HttpResult } from '../../controllers/BaseController.js';
import type { ITenantScopeRunner, TenantRunOptions } from '../../controllers/contracts/index.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { createRouteWrappers } from '../../routes/tenantRoute.js';

const OWNER = '0196f000-0000-7000-8000-0000000000b9';

const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BRANCH_A = '0196f000-0000-7000-8000-0000000001a1';
const scopeA: TenantScope = { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH_A] };

/**
 * Fake runner: records what happens in order, and can fail the "commit" after the handler resolved, which is
 * what a deferred constraint (the balanced-journal trigger) does in the real database.
 */
class FakeRunner implements ITenantScopeRunner {
  readonly events: string[] = [];
  lastScope?: TenantScope;
  lastOptions?: TenantRunOptions;
  constructor(private readonly commitFails = false) {}

  async run<T>(scope: TenantScope, fn: () => Promise<T>, options?: TenantRunOptions): Promise<T> {
    this.lastScope = scope;
    this.lastOptions = options;
    this.events.push('begin');
    try {
      const result = await fn();
      this.events.push('handler resolved');
      if (this.commitFails) throw new AppError('CONFLICT', 'commit refused');
      this.events.push('commit');
      return result;
    } catch (err) {
      this.events.push('rollback');
      throw err;
    }
  }
}

function appWith(
  runner: FakeRunner,
  handler: (req: Request) => Promise<HttpResult>,
  { tenant = scopeA as TenantScope | null, readOnly = false } = {},
) {
  const wrap = createRouteWrappers(runner);
  const app = express();
  app.use((req, res, next) => {
    if (tenant) req.tenant = tenant;
    req.auth = { userId: OWNER, organizationId: OWNER, sessionId: OWNER, roles: ['owner'], permissions: [] };
    // The wrapper must send only after the commit: record when the response starts.
    const send = res.send.bind(res);
    res.send = (body) => {
      runner.events.push('response sent');
      return send(body);
    };
    next();
  });
  app.post('/t', wrap.tenant(handler, { readOnly, roles: ['owner'] }));
  app.use(errorMiddleware);
  return app;
}

const created = async (): Promise<HttpResult> => ({ status: 201, body: { id: 'x' } });

describe('tenant route wrapper (ADR 0005 steps 2, 7, 8)', () => {
  it('runs the handler in the request scope and sends {status, body} after the commit', async () => {
    const runner = new FakeRunner();
    const res = await request(appWith(runner, created)).post('/t');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'x' });
    expect(runner.lastScope).toEqual(scopeA);
    expect(runner.events).toEqual(['begin', 'handler resolved', 'commit', 'response sent']);
  });

  it('a failed commit never returns a 2xx, even though the handler succeeded', async () => {
    const runner = new FakeRunner(true);
    const res = await request(appWith(runner, created)).post('/t');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT' });
    expect(runner.events).toEqual(['begin', 'handler resolved', 'rollback', 'response sent']);
  });

  it('a handler error rolls back and reaches errorMiddleware', async () => {
    const runner = new FakeRunner();
    const failing = async (): Promise<HttpResult> => {
      throw new AppError('NOT_FOUND', 'no such party');
    };
    const res = await request(appWith(runner, failing)).post('/t');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'no such party' });
    expect(runner.events).toEqual(['begin', 'rollback', 'response sent']);
  });

  it('refuses a tenant route when no tenant scope was resolved, before any transaction', async () => {
    const runner = new FakeRunner();
    const res = await request(appWith(runner, created, { tenant: null })).post('/t');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(runner.events).not.toContain('begin');
  });

  it('passes readOnly to the runner for read-only routes, and not otherwise', async () => {
    const reader = new FakeRunner();
    await request(appWith(reader, created, { readOnly: true })).post('/t');
    expect(reader.lastOptions).toEqual({ readOnly: true });

    const writer = new FakeRunner();
    await request(appWith(writer, created)).post('/t');
    expect(writer.lastOptions).toEqual({ readOnly: false });
  });
});

describe('public route wrapper', () => {
  it('sends {status, body} with no tenant scope', async () => {
    const runner = new FakeRunner();
    const app = express();
    app.get(
      '/p',
      createRouteWrappers(runner).public(async () => ({ status: 200, body: { ok: true } })),
    );
    const res = await request(app).get('/p');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(runner.events).toEqual([]);
  });
});

describe('response headers on route results (Farhan, #8 item 4)', () => {
  const withHeaders = async (): Promise<HttpResult> => ({
    status: 201,
    body: { id: 'p-1' },
    headers: { Location: '/v1/payments/p-1', 'Set-Cookie': 'erp_sid=abc; HttpOnly' },
  });

  it('a tenant route sends its headers with the body, after the commit', async () => {
    const runner = new FakeRunner();
    const res = await request(appWith(runner, withHeaders)).post('/t');
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/v1/payments/p-1');
    expect(res.headers['set-cookie']).toEqual(['erp_sid=abc; HttpOnly']);
    expect(runner.events).toEqual(['begin', 'handler resolved', 'commit', 'response sent']);
  });

  it('a failed commit sends none of the handler headers', async () => {
    const res = await request(appWith(new FakeRunner(true), withHeaders)).post('/t');
    expect(res.status).toBe(409);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a public route sends its headers too', async () => {
    const app = express();
    app.post('/p', createRouteWrappers(new FakeRunner()).public(withHeaders));
    const res = await request(app).post('/p');
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/v1/payments/p-1');
  });
});
