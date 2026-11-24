import { AppError, stockListQuerySchema, type PosCatalog, type StockListResponse } from '@erp/shared';
import type { Request } from 'express';
import { BaseController, type HttpResult } from './BaseController.js';
import type { IInventoryManager } from './contracts/IInventoryManager.js';

/**
 * Inventory module: HTTP controller. HTTP in and out only. Owner: Munif. Runs inside the request's read-only tenant
 * transaction (the route wrapper).
 */
export class InventoryController extends BaseController {
  constructor(protected readonly manager: IInventoryManager) {
    super();
  }

  /** GET /v1/stock: stock on hand per product per branch the caller may see, cursor paged. */
  async list(req: Request): Promise<HttpResult<StockListResponse>> {
    return this.json(200, await this.manager.list(this.parse(stockListQuerySchema, req.query)));
  }

  /** GET /v1/stock/pos-catalog: what the counter at X-Branch-Id can sell. */
  async posCatalog(req: Request): Promise<HttpResult<PosCatalog>> {
    const branchId = req.tenant?.branchId;
    if (!branchId) {
      const message = 'Choose the branch.';
      throw new AppError('VALIDATION_FAILED', message, [
        { path: 'X-Branch-Id', code: 'stock.branch_required', message },
      ]);
    }
    return this.json(200, await this.manager.posCatalog(branchId));
  }
}
