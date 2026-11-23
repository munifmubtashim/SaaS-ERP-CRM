import type { z } from 'zod';
import type {
  branchResultsSchema,
  businessDashboardRowSchema,
  customerInsightsSchema,
  dashboardFiguresSchema,
  dayCloseStatusSchema,
  needsActionSchema,
  ownerDashboardSchema,
  unitStockSchema,
} from '../schemas/report.schema.js';

/** Report module, types inferred from the Zod schemas. Owner: Munif. */
export type DashboardFigures = z.infer<typeof dashboardFiguresSchema>;
export type BusinessDashboardRow = z.infer<typeof businessDashboardRowSchema>;
export type OwnerDashboard = z.infer<typeof ownerDashboardSchema>;
export type BranchResults = z.infer<typeof branchResultsSchema>;
export type CustomerInsights = z.infer<typeof customerInsightsSchema>;
export type NeedsAction = z.infer<typeof needsActionSchema>;
export type DayCloseStatus = z.infer<typeof dayCloseStatusSchema>;
export type UnitStock = z.infer<typeof unitStockSchema>;
