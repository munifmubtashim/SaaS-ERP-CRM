import { AppError } from '@erp/shared';
import type { Request, RequestHandler } from 'express';
import type { HttpResult } from '../controllers/BaseController.js';
import type { ITenantScopeRunner } from '../controllers/contracts/index.js';

/** A Controller method as a route sees it: the request in, {status, body} out. */
export type RouteHandler = (req: Request) => Promise<HttpResult>;

export interface TenantRouteOptions {
  /** A read-only group route: may span several businesses, and its transaction runs READ ONLY (ADR 0005 Q2). */
  readOnly?: boolean;
}

/** Turn Controller methods into Express handlers. Routes files use these, never res.json themselves. */
export interface RouteWrappers {
  tenant(handler: RouteHandler, options?: TenantRouteOptions): RequestHandler;
  public(handler: RouteHandler): RequestHandler;
}

/**
 * The tenant route wrapper (ADR 0005 steps 2, 7, 8). It runs the handler inside one tenant transaction for
 * req.tenant and sends the response only after the transaction has committed. A thrown error or a failed
 * commit rolls back and reaches errorMiddleware, so it is never a 2xx. Express 5 does not wait for a
 * handler's promise, which is why Controllers return {status, body} instead of writing the response.
 */
export function createRouteWrappers(runner: ITenantScopeRunner): RouteWrappers {
  return {
    tenant:
      (handler, { readOnly = false } = {}) =>
      async (req, res, next) => {
        try {
          const tenant = req.tenant;
          if (!tenant) {
            throw new AppError(
              'INTERNAL_ERROR',
              'Tenant route without a tenant scope: tenantMiddleware must set it.',
            );
          }
          const { status, body } = await runner.run(tenant, () => handler(req), { readOnly });
          res.status(status).json(body);
        } catch (err) {
          next(err);
        }
      },
    public: (handler) => async (req, res, next) => {
      try {
        const { status, body } = await handler(req);
        res.status(status).json(body);
      } catch (err) {
        next(err);
      }
    },
  };
}
