import type { SalesQuery } from '@erp/dal';

/**
 * Sales module, business rules. No Express, no SQL: call SalesQuery. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class SalesManager {
  constructor(readonly query: SalesQuery) {}
}
