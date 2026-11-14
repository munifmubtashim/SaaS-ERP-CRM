import type { InventoryManager } from '@erp/business-logic';

/**
 * Inventory module, HTTP controller. Parse input, call InventoryManager, send the response. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class InventoryController {
  constructor(readonly manager: InventoryManager) {}
}
