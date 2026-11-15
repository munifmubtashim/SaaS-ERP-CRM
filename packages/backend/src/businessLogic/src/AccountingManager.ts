import type { IAccountingQuery } from './contracts/IAccountingQuery.js';

/**
 * Accounting module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class AccountingManager {
  constructor(protected readonly query: IAccountingQuery) {}
}
