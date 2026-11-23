import { AppError } from '@erp/shared';
import type { Request, RequestHandler, Response } from 'express';
import type { HttpResult } from '../controllers/BaseController.js';
import type { IIdempotency, ITenantScopeRunner } from '../controllers/contracts/index.js';

/** A Controller method as a route sees it: the request in, {status, body} out. */
export type RouteHandler = (req: Request) => Promise<HttpResult>;

export interface TenantRouteOptions {
  /** A read-only group route: may span several businesses, and its transaction runs READ ONLY (ADR 0005 Q2). */
  readOnly?: boolean;
  /**
   * A money or stock route (ADR 0011, ADR 0014 section 2): requires an Idempotency-Key, claims it inside the
   * request's transaction, and replays the first answer, headers included, to a repeat. Never with readOnly.
   */
  idempotent?: boolean;
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
export function createRouteWrappers(runner: ITenantScopeRunner, idempotency?: IIdempotency): RouteWrappers {
  return {
    tenant: (handler, { readOnly = false, idempotent = false } = {}) => {
      if (idempotent && (readOnly || !idempotency)) {
        // Refused when the route is built, so a misconfigured money route never starts.
        throw new AppError(
          'INTERNAL_ERROR',
          readOnly
            ? 'An idempotent route writes; it cannot be read-only.'
            : 'An idempotent route needs the idempotency guard: pass it to createRouteWrappers.',
        );
      }
      const run = idempotent && idempotency ? withIdempotency(idempotency, handler) : handler;
      return async (req, res, next) => {
        try {
          const tenant = req.tenant;
          if (!tenant) {
            throw new AppError(
              'INTERNAL_ERROR',
              'Tenant route without a tenant scope: tenantMiddleware must set it.',
            );
          }
          const result = await runner.run(tenant, () => run(req), { readOnly });
          // The transaction has committed. If sending fails from here on (for example a body that can't be
          // serialized), the client gets an error for a write that WAS saved, and may retry it. Money and stock
          // routes are safe to retry through Idempotency-Key (ADR 0011); other routes must tolerate a repeat.
          send(res, result);
        } catch (err) {
          next(err);
        }
      };
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

/**
 * Wraps a handler so it runs at most once per Idempotency-Key in the business (ADR 0014 section 2). Runs inside the
 * tenant transaction: the claim, the handler's writes and the stored answer commit together, and a thrown handler
 * rolls the claim back, so a retry with the same key runs again (test 11).
 */
function withIdempotency(guard: IIdempotency, handler: RouteHandler): RouteHandler {
  return async (req) => {
    const auth = req.auth;
    if (!auth)
      throw new AppError('INTERNAL_ERROR', 'Idempotent route without a session: authMiddleware must set it.');
    const key = req.get('Idempotency-Key');
    const route = `${req.method} ${req.baseUrl}${String(req.route?.path ?? req.path)}`;
    const claim = await guard.claim({ key, route, userId: auth.userId, body: req.body });
    if (claim.kind === 'replay') {
      return {
        status: claim.statusCode,
        body: claim.body,
        headers: { ...claim.headers, 'Idempotent-Replayed': 'true' },
      };
    }
    const result = await handler(req);
    // claim() validated the key, so it is a string here.
    await guard.complete(key as string, result);
    return result;
  };
}

/** Sets the result's headers, then sends its status and body. The only place a route writes the response. */
function send(res: Response, { status, body, headers }: HttpResult): void {
  if (headers) res.set(headers);
  res.status(status).json(body);
}
