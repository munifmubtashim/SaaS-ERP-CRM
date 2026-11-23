import type { PermissionCode, RoleCode, TenantScope } from '@erp/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ITenantScopeRunner } from '../../controllers/contracts/index.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { createRouteWrappers, type TenantRouteOptions } from '../../routes/tenantRoute.js';

/**
 * ADR 0051 test 4 and the role check (Munif, 23 Nov): a tenant route declares a permission code or the role codes
 * that may use it; anyone else gets 403 FORBIDDEN before the transaction opens and before the handler runs.
 */
const scope: TenantScope = {
  organizationId: '0196f000-0000-7000-8000-00000000000a',
  businessIds: ['0196f000-0000-7000-8000-0000000000a1'],
  branchIds: ['0196f000-0000-7000-8000-0000000001a1'],
};

class CountingRunner implements ITenantScopeRunner {
  runs = 0;
  async run<T>(_scope: TenantScope, fn: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn();
  }
}

function call(options: TenantRouteOptions, roles: RoleCode[], permissions: PermissionCode[]) {
  const runner = new CountingRunner();
  let handled = 0;
  const app = express();
  app.use((req, _res, next) => {
    req.tenant = scope;
    req.auth = {
      userId: scope.organizationId,
      organizationId: scope.organizationId,
      sessionId: scope.organizationId,
      roles,
      permissions,
    };
    next();
  });
  app.get(
    '/r',
    createRouteWrappers(runner).tenant(async () => {
      handled += 1;
      return { status: 200, body: { ok: true } };
    }, options),
  );
  app.use(errorMiddleware);
  return request(app)
    .get('/r')
    .then((res) => ({ status: res.status, code: res.body.code, runs: runner.runs, handled }));
}

describe('tenant route access options', () => {
  it("4. { permission: 'report.profit.view' }: a Cashier gets 403 before anything runs; an Accountant passes", async () => {
    const options = { permission: 'report.profit.view' } as const;
    expect(await call(options, ['cashier'], [])).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      runs: 0,
      handled: 0,
    });
    expect(await call(options, ['accountant'], ['report.profit.view'])).toMatchObject({
      status: 200,
      handled: 1,
    });
  });

  it("{ roles: ['owner', 'business_manager'] }: those roles pass; branch_manager, accountant and cashier get 403", async () => {
    const options = { roles: ['owner', 'business_manager'] } as const;
    for (const role of ['owner', 'business_manager'] as const) {
      expect(await call(options, [role], [])).toMatchObject({ status: 200, handled: 1 });
    }
    for (const role of ['branch_manager', 'accountant', 'cashier'] as const) {
      expect(await call(options, [role], [])).toEqual({
        status: 403,
        code: 'FORBIDDEN',
        runs: 0,
        handled: 0,
      });
    }
  });

  it('a route must declare its access: wrap.tenant without permission or roles is refused when built', () => {
    expect(() =>
      createRouteWrappers(new CountingRunner()).tenant(async () => ({ status: 200, body: {} })),
    ).toThrow(/declare who may use it/);
  });

  it('the declared access is readable on the handler, for the route-coverage walk', () => {
    const handler = createRouteWrappers(new CountingRunner()).tenant(
      async () => ({ status: 200, body: {} }),
      {
        roles: ['owner'],
      },
    );
    expect((handler as unknown as { access: unknown }).access).toEqual({ roles: ['owner'] });
  });
});
