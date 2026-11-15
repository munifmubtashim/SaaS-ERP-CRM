import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Munif): add one small method per use case (interface segregation)
export interface IReportService {}

/**
 * Report module: frontend API calls, one method per endpoint. Owner: Munif.
 * TODO(Munif): reports, owner dashboard, snapshots, notifications (roadmap 5.13).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ReportService implements IReportService {
  constructor(protected readonly http: IHttpClient) {}
}
