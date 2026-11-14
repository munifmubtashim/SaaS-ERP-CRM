import type { InventoryQuery } from '@erp/dal';

/**
 * Inventory module, business rules. No Express, no SQL: call InventoryQuery. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class InventoryManager {
  constructor(readonly query: InventoryQuery) {}
}
