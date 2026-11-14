import type { ReportQuery } from '@erp/dal';

/**
 * Report module, business rules. No Express, no SQL: call ReportQuery. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ReportManager {
  constructor(readonly query: ReportQuery) {}
}
