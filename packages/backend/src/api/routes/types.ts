import type { Router } from 'express';

/**
 * public: no tenant data and no login (health checks, login itself). Each public route must be on PUBLIC_ROUTES.
 * user: signed in, no business scope (/v1/me/..., ADR 0007 section 2, ADR 0060). Reads only the caller's own rows,
 * ignores X-Business-Id, and needs a case in test/isolation/cases.ts too.
 * tenant: reads or writes business-owned data. Each route needs a case in test/isolation/cases.ts.
 */
export type RouteScope = 'public' | 'user' | 'tenant';

/** What every <Module>Routes.ts returns. app.ts mounts `router` at `basePath`. */
export interface ModuleRoutes {
  module: string;
  /** Business routes live under /v1 (roadmap 4.4). */
  basePath: string;
  scope: RouteScope;
  router: Router;
}

/** The only public routes. Adding one needs the other developer's review. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /health',
  'POST /v1/auth/login',
  // Logout reads the cookie itself and always clears it, so it works with an expired session too.
  'POST /v1/auth/logout',
]);
