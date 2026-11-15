import type { IInventoryQuery } from './contracts/IInventoryQuery.js';

/**
 * Inventory module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class InventoryManager {
  constructor(protected readonly query: IInventoryQuery) {}
}
