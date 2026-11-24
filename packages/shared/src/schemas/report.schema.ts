import { z } from 'zod';
import { moneySchema } from '../utils/money.js';

/**
 * Report module, Zod schemas shared by backend and frontend. Owner: Munif.
 * Owner dashboard (task M6): read-only, across the businesses the owner may see. Money is a string.
 */
export const dashboardFiguresSchema = z.object({
  /** The receivable balance from the ledger (ADR 0023 section 1). */
  dues: moneySchema,
  /** Today's payment collections, voids netted (ADR 0023 section 1). */
  collectionsToday: moneySchema,
  /** Sales and service revenue from the 1st of this Dhaka month to today; never pass-through fees or VAT (24 Nov). */
  revenueMonth: moneySchema,
  /** The inventory account's balance (24 Nov). A cost figure: null for a caller without product.cost.view. */
  stockValue: moneySchema.nullable(),
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
