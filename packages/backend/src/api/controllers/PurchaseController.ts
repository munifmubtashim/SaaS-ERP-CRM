import type { PurchaseManager } from '@erp/business-logic';

/**
 * Purchase module, HTTP controller. Parse input, call PurchaseManager, send the response. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class PurchaseController {
  constructor(readonly manager: PurchaseManager) {}
}
