import type { ApiManagers, IIdempotency, ITenantScopeRunner } from './controllers/contracts/index.js';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from './config/logger.js';
import { SECURE_SESSION_COOKIE, type SessionCookieConfig } from './config/sessionCookie.js';
import { createControllers } from './controllers/index.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
import type { LoginRateLimiter } from './middleware/loginRateLimit.js';
import { createOriginCheck } from './middleware/originCheck.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/errorMiddleware.js';
import { requestIdFor } from './middleware/requestId.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { buildRoutes } from './routes/index.js';
import { createRouteWrappers } from './routes/tenantRoute.js';

export interface AppDeps {
  logger: Logger;
  managers: ApiManagers;
  /** Opens the one transaction per tenant request (ADR 0005). */
  tenantScope: ITenantScopeRunner;
  /** The Idempotency-Key guard for money and stock routes (ADR 0014); a route asking for it without one fails to build. */
  idempotency?: IIdempotency;
  /** The session cookie (ADR 0018 section 2); default: the production cookie, `__Host-erp_sid` with Secure. */
  sessionCookie?: SessionCookieConfig;
  /** The app's origin; every non-GET request must carry it (ADR 0018 section 2). Default: the Vite dev server. */
  appOrigin?: string;
  /** The per-IP login limiter (ADR 0018 section 4); default: a new in-process one. */
  loginRateLimiter?: LoginRateLimiter;
}

/** The development app origin (Vite, which proxies /api to the api). Production sets APP_ORIGIN (env.ts). */
export const DEV_APP_ORIGIN = 'http://localhost:5173';

/**
 * Builds the Express app without listening, so tests can drive it with Supertest.
 * Order: security headers, request id + logs, JSON body, auth and tenant for /v1, module routes,
 * 404, then the error middleware (always last).
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(helmet());
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req, res) => {
        const id = requestIdFor(req);
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  // CSRF (ADR 0018 section 2): a non-GET request from anywhere but the app is refused before its body is read.
  app.use(createOriginCheck(deps.appOrigin ?? DEV_APP_ORIGIN));
  app.use(express.json({ limit: '1mb' }));

  // Every business route lives under /v1 and passes auth and tenant resolution first.
  const cookie = deps.sessionCookie ?? SECURE_SESSION_COOKIE;
  app.use('/v1', createAuthMiddleware(deps.managers.auth, cookie), tenantMiddleware);

  const routes = buildRoutes(
    createControllers(deps.managers, cookie),
    createRouteWrappers(deps.tenantScope, deps.idempotency),
    deps.loginRateLimiter,
  );
  for (const { basePath, router } of routes) {
    app.use(basePath, router);
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
