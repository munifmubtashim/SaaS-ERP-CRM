import type { IPurchaseQuery } from './contracts/IPurchaseQuery.js';

/**
 * Purchase module: business rules. No Express, no SQL. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PurchaseManager {
  constructor(protected readonly query: IPurchaseQuery) {}
}
