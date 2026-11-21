import type { z } from 'zod';
import type {
  businessDashboardRowSchema,
  dashboardFiguresSchema,
  ownerDashboardSchema,
} from '../schemas/report.schema.js';

/** Report module, types inferred from the Zod schemas. Owner: Munif. */
export type DashboardFigures = z.infer<typeof dashboardFiguresSchema>;
export type BusinessDashboardRow = z.infer<typeof businessDashboardRowSchema>;
export type OwnerDashboard = z.infer<typeof ownerDashboardSchema>;
