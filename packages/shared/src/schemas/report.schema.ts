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

/*
 * PROVISIONAL VIEW SHAPES for the owner dashboard's second half (design/owner-dashboard/Main.dc.html), one per
 * service call. What the screen shows, not how it is computed or stored; they decide nothing about ledgers, stock or
 * day close. Replace them with the report plan (ADR 0023).
 */

const periodSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((p) => p.from <= p.to, { path: ['to'], message: 'The period ends before it starts' });

/** Revenue and net profit per branch for the period (a loss is a negative profit). */
export const branchResultsSchema = z.object({
  period: periodSchema,
  branches: z.array(
    z.object({
      branchId: z.uuid(),
      branchName: z.string().min(1),
      businessName: z.string().min(1),
      revenue: moneySchema,
      profit: moneySchema,
    }),
  ),
});

/** Who bought in the period, how many had bought before, and the top customers by revenue. */
export const customerInsightsSchema = z
  .object({
    period: periodSchema,
    customersBought: z.number().int().nonnegative(),
    repeatCustomers: z.number().int().nonnegative(),
    totalRevenue: moneySchema,
    topCustomers: z.array(z.object({ name: z.string().min(1), revenue: moneySchema })).max(10),
  })
  .refine((c) => c.repeatCustomers <= c.customersBought, {
    path: ['repeatCustomers'],
    message: 'More repeat than buyers',
  });

/**
 * One thing that needs the owner's attention. A kind and its figures, not a sentence, so the screen words it in
 * English or Bangla. Only kinds the system can actually produce: stock never goes negative, so there is no
 * "sold at zero stock".
 */
export const needsActionSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum([
        'unit_sold_not_delivered',
        'bank_receipt_unmatched',
        'parts_below_reorder',
        'supplier_duplicates',
      ]),
      severity: z.enum(['critical', 'warning']),
      ageDays: z.number().int().nonnegative(),
      amount: moneySchema.nullable(),
      count: z.number().int().positive().nullable(),
      businessName: z.string().min(1).nullable(),
      branchName: z.string().min(1).nullable(),
    }),
  ),
});

/** Day close status, read only: closing a period is not offered anywhere until day close (A17) is built. */
export const dayCloseStatusSchema = z.object({
  status: z.enum(['balanced', 'not_balanced', 'not_started']),
  lastClosedOn: z.iso.date().nullable(),
  unmatchedBankItems: z.number().int().nonnegative(),
});

/** Serial-tracked units by status (the design's bike stock card); counts only. */
export const unitStockSchema = z.object({
  asOf: z.iso.datetime(),
  available: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  soldNotDelivered: z.number().int().nonnegative(),
  over90Days: z.number().int().nonnegative(),
});
