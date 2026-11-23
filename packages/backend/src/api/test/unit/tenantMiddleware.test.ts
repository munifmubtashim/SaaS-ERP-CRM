import { AppError, type TenantScope } from '@erp/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { IAuthManager, ITenantScopeRunner } from '../../controllers/contracts/index.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { createTenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { createRouteWrappers } from '../../routes/tenantRoute.js';
import { managersWithDatabase, noTenantScope, silentLogger } from '../helpers.js';

/**
 * ADR 0051 tests 6 and 7, and the route kinds (Munif, 23 Nov): tenantMiddleware runs on tenant routers only,
 * requires X-Business-Id and X-Branch-Id, asks the auth Manager to verify them, and sets req.tenant, req.auth.roles
 * and req.auth.permissions. Every refusal happens before a tenant transaction opens.
 */
const ORG = '0196f000-0000-7000-8000-00000000000a';
const USER = '0196f000-0000-7000-8000-0000000000b1';
const BUSINESS = '0196f000-0000-7000-8000-0000000000a1';
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';
const tenant: TenantScope = {
  organizationId: ORG,
  businessIds: [BUSINESS],
  branchIds: [BRANCH],
  branchId: BRANCH,
};

/** An auth Manager whose sessions are always valid and whose scope answer the test sets. */
class FakeAuth implements IAuthManager {
  calls: { businessId: string; branchId: string }[] = [];
  constructor(private readonly allowed: boolean) {}
  login = () => Promise.reject(new Error('not used'));
  logout = () => Promise.resolve();
  authenticate = async () => ({ userId: USER, organizationId: ORG, sessionId: USER });
  resolveScope = async (_session: unknown, requested: { businessId: string; branchId: string }) => {
    this.calls.push(requested);
    if (!this.allowed) throw new AppError('NOT_FOUND', 'Business or branch not found.');
    return { tenant, roles: ['cashier'], permissions: [] };
  };
}

/** Counts transactions, so a test can see that a refusal opened none. */
class CountingRunner implements ITenantScopeRunner {
  runs = 0;
  async run<T>(_scope: TenantScope, fn: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn();
  }
}

function appWith(auth: FakeAuth) {
  const runner = new CountingRunner();
  const wrap = createRouteWrappers(runner);
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId: USER, organizationId: ORG, sessionId: USER, roles: [], permissions: [] };
    next();
  });
  app.get(
    '/v1/things',
    createTenantMiddleware(auth),
    wrap.tenant(async (req) => ({ status: 200, body: { tenant: req.tenant, auth: req.auth } }), {
      roles: ['cashier'],
    }),
  );
  app.use(errorMiddleware);
  return { app, runner };
}

const headers = { 'X-Business-Id': BUSINESS, 'X-Branch-Id': BRANCH };

describe('tenantMiddleware (ADR 0051)', () => {
  it('sets req.tenant and the roles and permissions that apply, from the two headers', async () => {
    const auth = new FakeAuth(true);
    const res = await request(appWith(auth).app).get('/v1/things').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.tenant).toEqual(tenant);
    expect(res.body.auth).toMatchObject({ roles: ['cashier'], permissions: [] });
    expect(auth.calls).toEqual([{ businessId: BUSINESS, branchId: BRANCH }]);
  });

  it('6. a missing or malformed header is 400 tenant.headers, and nothing is looked up or opened', async () => {
    const auth = new FakeAuth(true);
    const { app, runner } = appWith(auth);
    for (const sent of [
      {},
      { 'X-Business-Id': BUSINESS },
      { 'X-Branch-Id': BRANCH },
      { 'X-Business-Id': 'nope', 'X-Branch-Id': BRANCH },
      { 'X-Business-Id': `${BUSINESS},${BUSINESS}`, 'X-Branch-Id': BRANCH },
    ]) {
      const res = await request(app).get('/v1/things').set(sent);
      expect(res.status).toBe(400);
      expect(res.body.fields.map((field: { code: string }) => field.code)).toContain('tenant.headers');
    }
    expect(auth.calls).toEqual([]);
    expect(runner.runs).toBe(0);
  });

  it('7. a business or branch the user may not use is 404, before any transaction opens', async () => {
    const { app, runner } = appWith(new FakeAuth(false));
    const res = await request(app).get('/v1/things').set(headers);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Business or branch not found.' });
    expect(runner.runs).toBe(0);
  });
});

describe('route kinds: only tenant routers need the headers', () => {
  const app = () => {
    const managers = managersWithDatabase(true);
    managers.auth = new FakeAuth(true);
    return createApp({ logger: silentLogger, managers, tenantScope: noTenantScope });
  };

  it('/health and /v1/auth/logout answer without X-Business-Id or X-Branch-Id', async () => {
    expect((await request(app()).get('/health')).status).toBe(200);
    const logout = await request(app()).post('/v1/auth/logout').set('Origin', 'http://localhost:5173');
    expect(logout.status).toBe(204);
  });

  it('a tenant module router without the headers is 400 tenant.headers', async () => {
    const res = await request(app()).get('/v1/products').set('Cookie', '__Host-erp_sid=x');
    expect(res.status).toBe(400);
    expect(res.body.fields[0].code).toBe('tenant.headers');
  });
});
