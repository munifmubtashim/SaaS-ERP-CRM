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
 * PROVISIONAL VIEW SHAPES for the owner dashboard (design/owner-dashboard/Main.dc.html), one per service call, so each
 * figure can be real or sample on its own (VITE_DEMO_DATA). They describe what the screen shows, not how figures are
 * computed or stored; they decide nothing about ledgers or snapshots. Replace them with the report plan (ADR 0023).
 */

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'A month is YYYY-MM');

/** Will be real: today's and this month's sales, by business. */
export const salesTodaySchema = z.object({
  asOf: z.iso.datetime(),
  today: moneySchema,
  invoicesToday: z.number().int().nonnegative(),
  monthToDate: moneySchema,
  byBusiness: z.array(z.object({ businessId: z.uuid(), name: z.string().min(1), monthToDate: moneySchema })),
});

/** Will be real: unit stock and its value at cost (a hidden field, present only when allowed). */
export const stockValueSchema = z.object({
  asOf: z.iso.datetime(),
  unitsInStock: z.number().int().nonnegative(),
  unitsOver90Days: z.number().int().nonnegative(),
  valueAtCost: moneySchema.optional(),
});

/** Dues as aged entries (customer dues will be real; supplier dues stay sample). The screen buckets them. */
export const agedDuesSchema = z.object({
  asOf: z.iso.datetime(),
  entries: z.array(z.object({ ageDays: z.number().int().nonnegative(), amount: moneySchema })),
});

/** Sample: the month's sales target and how far through the month we are. */
export const salesTargetSchema = z
  .object({
    month,
    daysInMonth: z.number().int().min(28).max(31),
    daysElapsed: z.number().int().min(0),
    target: moneySchema,
    byBusiness: z.array(z.object({ businessId: z.uuid(), name: z.string().min(1), target: moneySchema })),
  })
  .refine((t) => t.daysElapsed <= t.daysInMonth, {
    path: ['daysElapsed'],
    message: 'Past the end of the month',
  });

/** Sample: the VAT return for the last month. */
export const vatReturnSchema = z.object({
  period: month,
  dueOn: z.iso.date(),
  estimatedPayable: moneySchema,
  status: z.enum(['draft', 'filed']),
});

/** Sample: cash and bank now, and the recent daily averages the forecast uses. */
export const cashPositionSchema = z.object({
  asOf: z.iso.datetime(),
  cashNow: moneySchema,
  averageDailySpending: moneySchema,
  averageDailySales: moneySchema,
});

/** Sample: revenue and expenses by month; the current month may be an estimate. */
export const monthlyResultsSchema = z.object({
  months: z.array(z.object({ month, revenue: moneySchema, expenses: moneySchema, estimate: z.boolean() })),
});

/** Sample: when the bank feed last synced. */
export const bankFeedSchema = z.object({ lastSyncAt: z.iso.datetime() });
