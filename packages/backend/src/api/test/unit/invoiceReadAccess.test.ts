import type { PermissionCode, TenantScope } from '@erp/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ISalesManager, ITenantScopeRunner } from '../../controllers/contracts/index.js';
import { SalesController } from '../../controllers/SalesController.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { salesRoutes } from '../../routes/SalesRoutes.js';
import { createRouteWrappers } from '../../routes/tenantRoute.js';
import { unusedIdempotency } from '../helpers.js';

/**
 * F4 (ADR 0059 section 2 and test 5): GET /v1/invoices and GET /v1/invoices/:id need sales.invoice.view. Without it the
 * answer is 403 before the transaction opens and before the Manager runs; with it the query is parsed strictly and the
 * Manager answers. The real router and controller over a fake Manager.
 */
const scope: TenantScope = {
  organizationId: '0196f000-0000-7000-8000-00000000000a',
  businessIds: ['0196f000-0000-7000-8000-0000000000a1'],
  branchIds: ['0196f000-0000-7000-8000-0000000001a1'],
  branchId: '0196f000-0000-7000-8000-0000000001a1',
};
const PARTY = '0196f000-0000-7000-8000-000000000501';

class CountingRunner implements ITenantScopeRunner {
  runs = 0;
  async run<T>(_scope: TenantScope, fn: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn();
  }
}

function app(permissions: PermissionCode[]) {
  const runner = new CountingRunner();
  const asked: unknown[] = [];
  const manager = {
    listInvoices: async (query: unknown) => (asked.push(query), { items: [], nextCursor: null }),
    getInvoice: async (id: string) => (asked.push(id), { id }),
  } as unknown as ISalesManager;
  const server = express();
  server.use((req, _res, next) => {
    req.tenant = scope;
    req.auth = {
      userId: scope.organizationId,
      organizationId: scope.organizationId,
      sessionId: scope.organizationId,
      roles: [],
      permissions,
    };
    next();
  });
  server.use(
    '/v1/invoices',
    salesRoutes(new SalesController(manager), createRouteWrappers(runner, unusedIdempotency)).router,
  );
  server.use(errorMiddleware);
  return { server, runner, asked };
}

describe('the invoice reads need sales.invoice.view', () => {
  it('without it, the list and the detail are 403 and nothing runs', async () => {
    const { server, runner, asked } = app(['sales.invoice.post']);
    for (const path of ['/v1/invoices', `/v1/invoices/${PARTY}`]) {
      const res = await request(server).get(path);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect(runner.runs).toBe(0);
    expect(asked).toEqual([]);
  });

  it('with it, the list gets the parsed query and the detail its id', async () => {
    const { server, asked } = app(['sales.invoice.view']);
    expect((await request(server).get(`/v1/invoices?partyId=${PARTY}&limit=5`)).status).toBe(200);
    expect((await request(server).get(`/v1/invoices/${PARTY}`)).status).toBe(200);
    expect(asked).toEqual([{ partyId: PARTY, limit: 5 }, PARTY]);
  });

  it('an unknown filter, such as businessId, is 400: the business comes from the scope only', async () => {
    const { server, asked } = app(['sales.invoice.view']);
    const res = await request(server).get(`/v1/invoices?businessId=${PARTY}`);
    expect(res.status).toBe(400);
    expect(asked).toEqual([]);
  });
});
