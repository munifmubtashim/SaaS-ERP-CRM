import type { AccountingQuery } from '@erp/dal';

/**
 * Accounting module, business rules. No Express, no SQL: call AccountingQuery. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class AccountingManager {
  constructor(readonly query: AccountingQuery) {}
}
