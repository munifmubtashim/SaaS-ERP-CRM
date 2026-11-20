import { z } from 'zod';
import { moneySchema } from '../utils/money.js';

/**
 * Report module, Zod schemas shared by backend and frontend. Owner: Munif.
 * Owner dashboard (task M6): read-only, across the businesses the owner may see. Money is a string.
 */
export const dashboardFiguresSchema = z.object({
  dues: moneySchema,
  collectionsToday: moneySchema,
});

export const businessDashboardRowSchema = dashboardFiguresSchema.extend({
  businessId: z.uuid(),
  name: z.string().min(1).max(200),
});

/** GET /v1/reports/owner-dashboard. `asOf` says how fresh the figures are (they come from snapshots). */
export const ownerDashboardSchema = z.object({
  /** ISO 8601, UTC. */
  asOf: z.iso.datetime(),
  totals: dashboardFiguresSchema,
  businesses: z.array(businessDashboardRowSchema),
});
