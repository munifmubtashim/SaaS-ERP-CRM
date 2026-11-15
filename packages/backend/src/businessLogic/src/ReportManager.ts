import type { IReportQuery } from './contracts/IReportQuery.js';

/**
 * Report module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ReportManager {
  constructor(protected readonly query: IReportQuery) {}
}
