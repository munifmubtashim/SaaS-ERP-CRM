import type { ReportManager } from '@erp/business-logic';

/**
 * Report module, HTTP controller. Parse input, call ReportManager, send the response. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ReportController {
  constructor(readonly manager: ReportManager) {}
}
