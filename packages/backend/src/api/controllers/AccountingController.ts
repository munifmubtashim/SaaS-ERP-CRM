import type { AccountingManager } from '@erp/business-logic';

/**
 * Accounting module, HTTP controller. Parse input, call AccountingManager, send the response. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class AccountingController {
  constructor(readonly manager: AccountingManager) {}
}
