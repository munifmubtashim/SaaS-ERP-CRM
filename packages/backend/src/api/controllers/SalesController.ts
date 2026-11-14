import type { SalesManager } from '@erp/business-logic';

/**
 * Sales module, HTTP controller. Parse input, call SalesManager, send the response. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class SalesController {
  constructor(readonly manager: SalesManager) {}
}
