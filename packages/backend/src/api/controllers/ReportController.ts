import { BaseController } from './BaseController.js';
import type { IReportManager } from './contracts/IReportManager.js';

/**
 * Report module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ReportController extends BaseController {
  constructor(protected readonly manager: IReportManager) {
    super();
  }
}
