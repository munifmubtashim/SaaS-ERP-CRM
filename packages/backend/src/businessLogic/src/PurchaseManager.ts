import type { PurchaseQuery } from '@erp/dal';

/**
 * Purchase module, business rules. No Express, no SQL: call PurchaseQuery. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class PurchaseManager {
  constructor(readonly query: PurchaseQuery) {}
}
