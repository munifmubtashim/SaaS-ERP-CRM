import { BaseController } from './BaseController.js';
import type { IServiceManager } from './contracts/IServiceManager.js';

/**
 * Service module: HTTP controller. HTTP in and out only. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ServiceController extends BaseController {
  constructor(protected readonly manager: IServiceManager) {
    super();
  }
}
