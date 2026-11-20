import { join, sep } from 'node:path';
import type { ApiManagers } from './controllers/contracts/index.js';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from './config/logger.js';
import { createControllers } from './controllers/index.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/errorMiddleware.js';
import { requestIdFor } from './middleware/requestId.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { buildRoutes } from './routes/index.js';

/** /api/..., /v1/... and /health/... as the client sent them: the API, never a page of the frontend. */
const API_PATH = /^\/(?:api|v1|health)(?:\/|$)/;
const isApiPath = (req: Request): boolean => API_PATH.test(req.originalUrl.split('?')[0] ?? '');
const IMMUTABLE = 'public, max-age=31536000, immutable';

export interface AppDeps {
  logger: Logger;
  managers: ApiManagers;
  /** The built frontend (STATIC_DIR). Set in the production image only; development uses Vite. */
  staticDir?: string;
}

/**
 * Builds the Express app without listening, so tests can drive it with Supertest.
 * Order: security headers, request id + logs, JSON body, auth and tenant for /v1, module routes,
 * the built frontend (when staticDir is set), 404, then the error middleware (always last).
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

  if (deps.staticDir) {
    // Same origin as the built frontend: the browser calls /api/..., as through the Vite proxy in development.
    app.use((req, _res, next) => {
      if (req.url === '/api' || req.url.startsWith('/api/')) req.url = req.url.slice('/api'.length) || '/';
      next();
    });
  }

  // Every business route lives under /v1 and passes auth and tenant resolution first.
  app.use('/v1', authMiddleware, tenantMiddleware);

  for (const { basePath, router } of buildRoutes(createControllers(deps.managers))) {
    app.use(basePath, router);
  }

  if (deps.staticDir) {
    const indexHtml = join(deps.staticDir, 'index.html');
    const assetsDir = join(deps.staticDir, 'assets') + sep;
    const serveStatic = express.static(deps.staticDir, {
      index: 'index.html',
      // Vite puts content-hashed files in assets/: a new build gets new names, so they never change.
      // index.html names the current ones, so the browser revalidates it on every visit.
      setHeaders: (res, filePath) => {
        if (filePath.startsWith(assetsDir)) res.setHeader('Cache-Control', IMMUTABLE);
        else if (filePath === indexHtml) res.setHeader('Cache-Control', 'no-cache');
      },
    });
    // API paths (judged on the URL as the client sent it, before /api was stripped) never get a file or
    // index.html: they stay JSON 404s.
    app.use((req, res, next) => (isApiPath(req) ? next() : serveStatic(req, res, next)));
    // A page route of the app (a reload on /customers/42) gets index.html.
    app.use((req, res, next) => {
      if (req.method === 'GET' && !isApiPath(req) && req.accepts('html')) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexHtml);
        return;
      }
      next();
    });
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
