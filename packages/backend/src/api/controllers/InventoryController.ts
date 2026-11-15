import { BaseController } from './BaseController.js';
import type { IInventoryManager } from './contracts/IInventoryManager.js';

/**
 * Inventory module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class InventoryController extends BaseController {
  constructor(protected readonly manager: IInventoryManager) {
    super();
  }
}
