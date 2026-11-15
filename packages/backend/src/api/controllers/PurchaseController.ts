import { BaseController } from './BaseController.js';
import type { IPurchaseManager } from './contracts/IPurchaseManager.js';

/**
 * Purchase module: HTTP controller. HTTP in and out only. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PurchaseController extends BaseController {
  constructor(protected readonly manager: IPurchaseManager) {
    super();
  }
}
