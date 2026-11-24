import { hasPermission, type OwnerDashboard } from '@erp/shared';
import type { Request } from 'express';
import { BaseController, type HttpResult } from './BaseController.js';
import type { IReportManager } from './contracts/IReportManager.js';

/**
 * Report module: HTTP controller. HTTP in and out only. Owner: Munif. Runs inside the request's read-only tenant
 * transaction (the route wrapper).
 */
export class ReportController extends BaseController {
  constructor(protected readonly manager: IReportManager) {
    super();
  }

  /** GET /v1/reports/owner-dashboard (ADR 0023 section 2). Stock value only for callers with product.cost.view. */
  async ownerDashboard(req: Request): Promise<HttpResult<OwnerDashboard>> {
    const canSeeCost = hasPermission(req.auth?.permissions ?? [], 'product.cost.view');
    return this.json(200, await this.manager.ownerDashboard({ canSeeCost }));
  }
}
