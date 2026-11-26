import {
  AppError,
  createPartySchema,
  deactivatePartySchema,
  partyListQuerySchema,
  updatePartySchema,
  type Party,
  type PartyListResponse,
} from '@erp/shared';
import type { Request } from 'express';
import { BaseController, type HttpResult } from './BaseController.js';
import type { IPartyManager, PartyCaller } from './contracts/IPartyManager.js';

/**
 * Party module: HTTP controller (ADR 0056 section 4, the customer routes). HTTP in and out only. Owner: Farhan. Runs
 * inside the request's tenant transaction (the route wrapper), after tenantMiddleware and the permission check.
 */
export class PartyController extends BaseController {
  constructor(protected readonly manager: IPartyManager) {
    super();
  }

  async list(req: Request): Promise<HttpResult<PartyListResponse>> {
    return this.json(200, await this.manager.list(this.parse(partyListQuerySchema, req.query)));
  }

  async get(req: Request): Promise<HttpResult<Party>> {
    return this.json(200, await this.manager.get(String(req.params.id)));
  }

  /** The creator is the signed-in user and the branch is the request's; neither comes from the body. */
  async create(req: Request): Promise<HttpResult<Party>> {
    const party = await this.manager.create(this.parse(createPartySchema, req.body), this.caller(req));
    return { status: 201, body: party, headers: { Location: `/v1/parties/${party.id}` } };
  }

  async edit(req: Request): Promise<HttpResult<Party>> {
    const edit = this.parse(updatePartySchema, req.body);
    return this.json(200, await this.manager.edit(String(req.params.id), edit, this.caller(req)));
  }

  async deactivate(req: Request): Promise<HttpResult<Party>> {
    const { version } = this.parse(deactivatePartySchema, req.body);
    return this.json(200, await this.manager.deactivate(String(req.params.id), version));
  }

  private caller(req: Request): PartyCaller {
    const userId = req.auth?.userId;
    if (!userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    return { userId, branchId: req.tenant?.branchId ?? null, permissions: req.auth?.permissions ?? [] };
  }
}
