/** One business's dashboard figures as the view returns them: numeric(18,2) text (ADR 0023, amended 24 Nov). */
export interface DashboardRow {
  businessId: string;
  name: string;
  dues: string;
  collectionsToday: string;
  revenueMonth: string;
  stockValue: string;
}

/** What ReportManager needs from the database. Owned by businessLogic; dal's ReportQuery satisfies it. */
export interface IReportQuery {
  /** report_owner_dashboard, read with the caller's RLS, one row per business in scope, by name. */
  ownerDashboard(): Promise<DashboardRow[]>;
}
