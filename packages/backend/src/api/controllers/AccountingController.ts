import { BaseController } from './BaseController.js';
import type { IAccountingManager } from './contracts/IAccountingManager.js';

/**
 * Accounting module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class AccountingController extends BaseController {
  constructor(protected readonly manager: IAccountingManager) {
    super();
  }
}
