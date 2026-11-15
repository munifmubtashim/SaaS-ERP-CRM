import type { ApiManagers } from './controllers/contracts/index.js';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from './config/logger.js';
import { createControllers } from './controllers/index.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/errorMiddleware.js';
import { requestIdFor } from './middleware/requestId.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { buildRoutes } from './routes/index.js';

export interface AppDeps {
  logger: Logger;
  managers: ApiManagers;
}

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
  app.use(express.json({ limit: '1mb' }));

  // Every business route lives under /v1 and passes auth and tenant resolution first.
  app.use('/v1', authMiddleware, tenantMiddleware);

  for (const { basePath, router } of buildRoutes(createControllers(deps.managers))) {
    app.use(basePath, router);
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
