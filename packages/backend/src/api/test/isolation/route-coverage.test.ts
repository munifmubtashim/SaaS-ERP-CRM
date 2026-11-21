import type { Express, Router } from 'express';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createControllers } from '../../controllers/index.js';
import { buildRoutes, PUBLIC_ROUTES } from '../../routes/index.js';
import { createRouteWrappers } from '../../routes/tenantRoute.js';
import { managersWithDatabase, noTenantScope, silentLogger } from '../helpers.js';
import { ISOLATION_CASES } from './cases.js';

// Tenant-isolation suite, Phase 0 part (roadmap 4.2, 10.1): "A new route without an isolation test
// fails CI." Phase 1 adds the cases themselves: log in as business X, try to read, write and guess
// ids of business Y on every route; group owner of org A reads nothing of org B.

interface Layer {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
}
const stackOf = (r: Router | Express): Layer[] =>
  ((r as unknown as { stack?: Layer[]; router?: { stack: Layer[] } }).stack ??
    (r as unknown as { router: { stack: Layer[] } }).router.stack) as Layer[];

const managers = managersWithDatabase(true);
const modules = buildRoutes(createControllers(managers), createRouteWrappers(noTenantScope));
const routes = modules.flatMap(({ basePath, scope, router }) =>
  stackOf(router).flatMap(({ route }) =>
    route
      ? Object.keys(route.methods).map((m) => ({
          key: `${m.toUpperCase()} ${basePath}${route.path === '/' ? '' : route.path}`,
          scope,
        }))
      : [],
  ),
);

describe('route coverage for tenant isolation', () => {
  it('mounts every module router and registers no route outside them', () => {
    const top = stackOf(createApp({ logger: silentLogger, managers, tenantScope: noTenantScope }));
    expect(top.flatMap(({ route }) => (route ? [route.path] : []))).toEqual([]);
    expect(top.filter((l) => l.name === 'router')).toHaveLength(modules.length);
  });

  it('allows a route to be public only when it is on the public allowlist', () => {
    const unexpected = routes.filter((r) => r.scope === 'public' && !PUBLIC_ROUTES.has(r.key));
    expect(unexpected.map((r) => r.key)).toEqual([]);
  });

  it('has an isolation case for every tenant-scoped route', () => {
    const missing = routes.filter((r) => r.scope === 'tenant' && !(r.key in ISOLATION_CASES));
    expect(
      missing.map((r) => r.key),
      'Add a cross-tenant case to test/isolation/cases.ts',
    ).toEqual([]);
  });

  it('keeps every business module under /v1', () => {
    const outside = modules.filter((m) => m.module !== 'Health' && !m.basePath.startsWith('/v1/'));
    expect(outside.map((m) => m.module)).toEqual([]);
  });
});
