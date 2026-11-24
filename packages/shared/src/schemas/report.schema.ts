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

/**
 * Provisional, a view shape only: recent points behind each key figure, oldest first (the design's small trend
 * lines). Sample data until a report decides the period and source of each series.
 */
const trendSchema = z.array(moneySchema).min(2).max(31);
export const kpiTrendsSchema = z.object({
  revenue: trendSchema,
  profit: trendSchema,
  cash: trendSchema,
  customerDues: trendSchema,
  supplierPayable: trendSchema,
});

/**
 * Provisional, a view shape only: the cash forecast as ADR 0047 section 1 lists its lines. The opening by account
 * role (cash, bank, mobile money); one bucket per week starting Saturday, for 4, 8 or 13 weeks, with expected
 * collections (counted at 100 %, labelled "Expected"), supplier bills due, recurring expenses (rent included) and
 * salaries; dues already overdue on their own Uncertain line, never added. There is no "expected new sales" line.
 * Sample data until the report (GET /v1/reports/cash_forecast?weeks=) exists.
 */
export const forecastWeeksSchema = z.union([z.literal(4), z.literal(8), z.literal(13)]);
const forecastBucketSchema = z.object({
  weekStart: z.iso.date(),
  expectedCollections: moneySchema,
  supplierBills: moneySchema,
  recurringExpenses: moneySchema,
  salaries: moneySchema,
});
export const cashForecastSchema = z
  .object({
    asOf: z.iso.datetime(),
    weeks: forecastWeeksSchema,
    opening: z.object({ cash: moneySchema, bank: moneySchema, mobileMoney: moneySchema }),
    buckets: z.array(forecastBucketSchema),
    uncertain: moneySchema,
  })
  .refine((forecast) => forecast.buckets.length === forecast.weeks, {
    message: 'One bucket per week',
    path: ['buckets'],
  });
