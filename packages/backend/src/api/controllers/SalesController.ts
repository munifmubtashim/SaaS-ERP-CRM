import { AppError, postInvoiceSchema, type PostedInvoice } from '@erp/shared';
import type { Request } from 'express';
import { BaseController, type HttpResult } from './BaseController.js';
import type { ISalesManager } from './contracts/ISalesManager.js';

/**
 * Sales module: HTTP controller. HTTP in and out only. Owner: Farhan; posting a sale built by Munif for item 3b.
 * Runs inside the request's tenant transaction (the route wrapper), after tenantMiddleware, the permission check and
 * the Idempotency-Key claim.
 */
export class SalesController extends BaseController {
  constructor(protected readonly manager: ISalesManager) {
    super();
  }

  /**
   * POST /v1/invoices (ADR 0022 section 2). The branch is X-Branch-Id and the seller the signed-in user; neither
   * comes from the body. The answer never carries a cost (postedInvoiceSchema).
   */
  async postInvoice(req: Request): Promise<HttpResult<PostedInvoice>> {
    const userId = req.auth?.userId;
    if (!userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    const branchId = req.tenant?.branchId;
    if (!branchId) {
      const message = 'Choose the branch this sale is made at.';
      throw new AppError('VALIDATION_FAILED', message, [
        { path: 'X-Branch-Id', code: 'invoice.branch_required', message },
      ]);
    }
    const invoice = await this.manager.postInvoice(this.parse(postInvoiceSchema, req.body), {
      branchId,
      userId,
    });
    return { status: 201, body: invoice, headers: { Location: `/v1/invoices/${invoice.id}` } };
  }
}
