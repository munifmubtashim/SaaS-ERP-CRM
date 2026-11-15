import { BaseController } from './BaseController.js';
import type { ICrmManager } from './contracts/ICrmManager.js';

/**
 * Crm module: HTTP controller. HTTP in and out only. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class CrmController extends BaseController {
  constructor(protected readonly manager: ICrmManager) {
    super();
  }
}
