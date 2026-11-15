import { BaseController } from './BaseController.js';
import type { ISalesManager } from './contracts/ISalesManager.js';

/**
 * Sales module: HTTP controller. HTTP in and out only. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class SalesController extends BaseController {
  constructor(protected readonly manager: ISalesManager) {
    super();
  }
}
