import type { z } from 'zod';
import type {
  agedDuesSchema,
  bankFeedSchema,
  branchResultsSchema,
  businessDashboardRowSchema,
  cashPositionSchema,
  customerInsightsSchema,
  dashboardFiguresSchema,
  dayCloseStatusSchema,
  monthlyResultsSchema,
  needsActionSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
  unitStockSchema,
  kpiTrendsSchema,
  cashForecastSchema,
  forecastWeeksSchema,
  vatReturnSchema,
} from '../schemas/report.schema.js';

/** Report module, types inferred from the Zod schemas. Owner: Munif. */
export type DashboardFigures = z.infer<typeof dashboardFiguresSchema>;
export type BusinessDashboardRow = z.infer<typeof businessDashboardRowSchema>;
export type OwnerDashboard = z.infer<typeof ownerDashboardSchema>;
export type SalesToday = z.infer<typeof salesTodaySchema>;
export type StockValue = z.infer<typeof stockValueSchema>;
export type AgedDues = z.infer<typeof agedDuesSchema>;
export type SalesTarget = z.infer<typeof salesTargetSchema>;
export type VatReturn = z.infer<typeof vatReturnSchema>;
export type CashPosition = z.infer<typeof cashPositionSchema>;
export type MonthlyResults = z.infer<typeof monthlyResultsSchema>;
export type BankFeed = z.infer<typeof bankFeedSchema>;
export type BranchResults = z.infer<typeof branchResultsSchema>;
export type CustomerInsights = z.infer<typeof customerInsightsSchema>;
export type NeedsAction = z.infer<typeof needsActionSchema>;
export type DayCloseStatus = z.infer<typeof dayCloseStatusSchema>;
export type UnitStock = z.infer<typeof unitStockSchema>;
export type KpiTrends = z.infer<typeof kpiTrendsSchema>;
export type CashForecast = z.infer<typeof cashForecastSchema>;
export type ForecastWeeks = z.infer<typeof forecastWeeksSchema>;
