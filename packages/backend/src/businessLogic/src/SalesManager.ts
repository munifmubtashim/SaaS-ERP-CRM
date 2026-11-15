import type { ISalesQuery } from './contracts/ISalesQuery.js';

/**
 * Sales module: business rules. No Express, no SQL. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class SalesManager {
  constructor(protected readonly query: ISalesQuery) {}
}
