import { AppError } from '@erp/shared';
import type { Request, RequestHandler, Response } from 'express';
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
          const result = await runner.run(tenant, () => handler(req), { readOnly });
          // The transaction has committed. If sending fails from here on (for example a body that can't be
          // serialized), the client gets an error for a write that WAS saved, and may retry it. Money and stock
          // routes are safe to retry through Idempotency-Key (ADR 0011); other routes must tolerate a repeat.
          send(res, result);
        } catch (err) {
          next(err);
        }
      },
    public: (handler) => async (req, res, next) => {
      try {
        send(res, await handler(req));
      } catch (err) {
        next(err);
      }
    },
  };
}

/** Sets the result's headers, then sends its status and body. The only place a route writes the response. */
function send(res: Response, { status, body, headers }: HttpResult): void {
  if (headers) res.set(headers);
  res.status(status).json(body);
}
