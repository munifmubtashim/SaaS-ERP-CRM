import { BaseQuery } from './BaseQuery.js';

/**
 * Report module: database access (dal). Satisfies businessLogic contracts/IReportQuery. Owner: Munif. Reads the
 * security_invoker view report_owner_dashboard (dal/sql/views/report.sql) inside the request's read-only tenant
 * transaction, so the caller's RLS applies; money comes back as numeric(18,2) text.
 */
export class ReportQuery extends BaseQuery {
  async ownerDashboard(): Promise<
    {
      businessId: string;
      name: string;
      dues: string;
      collectionsToday: string;
      revenueMonth: string;
      stockValue: string;
    }[]
  > {
    return this.db.$queryRaw`
      SELECT business_id::text AS "businessId", name, dues::text, collections_today::text AS "collectionsToday",
             revenue_month::text AS "revenueMonth", stock_value::text AS "stockValue"
        FROM report_owner_dashboard
       ORDER BY name, business_id`;
  }
}
