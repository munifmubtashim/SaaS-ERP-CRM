import type { z } from 'zod';
import type {
  agedDuesSchema,
  bankFeedSchema,
  businessDashboardRowSchema,
  cashPositionSchema,
  dashboardFiguresSchema,
  monthlyResultsSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
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
