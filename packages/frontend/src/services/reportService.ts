import { ownerDashboardSchema, type OwnerDashboard } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the owner dashboard needs from Report. One small method per use. */
export interface IReportService {
  ownerDashboard(): Promise<OwnerDashboard>;
}

/**
 * Report module: frontend API calls, one method per endpoint. Owner: Munif.
 * createServices uses MockReportService until GET /v1/reports/owner-dashboard exists (M6).
 */
export class ReportService implements IReportService {
  constructor(protected readonly http: IHttpClient) {}

  ownerDashboard(): Promise<OwnerDashboard> {
    return this.http.getJson('/v1/reports/owner-dashboard', ownerDashboardSchema);
  }
}
