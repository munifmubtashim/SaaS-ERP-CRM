import { describe, expect, it } from 'vitest';
import {
  agedDuesSchema,
  bankFeedSchema,
  branchResultsSchema,
  cashPositionSchema,
  cashForecastSchema,
  customerInsightsSchema,
  dayCloseStatusSchema,
  kpiTrendsSchema,
  monthlyResultsSchema,
  needsActionSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
  unitStockSchema,
  vatReturnSchema,
} from './report.schema.js';

// Obviously fake sample data only.
const BIZ = '0196f000-0000-7000-8000-0000000000a1';

describe('ownerDashboardSchema', () => {
  const dashboard = {
    asOf: '2026-11-16T10:00:00.000Z',
    totals: { dues: '1234567.50', collectionsToday: '45000.00' },
    businesses: [{ businessId: BIZ, name: 'Demo Motors', dues: '1234567.50', collectionsToday: '45000.00' }],
  };

  it('accepts money as two-decimal strings', () => {
    expect(ownerDashboardSchema.safeParse(dashboard).success).toBe(true);
  });

  it('rejects money sent as a number', () => {
    expect(
      ownerDashboardSchema.safeParse({ ...dashboard, totals: { dues: 1234567.5, collectionsToday: '0.00' } })
        .success,
    ).toBe(false);
  });

  it('allows an empty business list (the empty state)', () => {
    expect(
      ownerDashboardSchema.safeParse({
        ...dashboard,
        totals: { dues: '0.00', collectionsToday: '0.00' },
        businesses: [],
      }).success,
    ).toBe(true);
  });
});

// Provisional dashboard view shapes (synthetic sample only): one per service call, so each can be real or sample.
describe('dashboard view shapes (provisional)', () => {
  const asOf = '2026-11-12T03:00:00.000Z';

  it('sales today: money as strings; month to date by business', () => {
    const sales = {
      asOf,
      today: '1280000.00',
      invoicesToday: 14,
      monthToDate: '14059500.00',
      byBusiness: [
        {
          businessId: '0196f000-0000-7000-8000-0000000000a1',
          name: 'Sample Motors',
          monthToDate: '10248000.00',
        },
      ],
    };
    expect(salesTodaySchema.parse(sales)).toEqual(sales);
    expect(salesTodaySchema.safeParse({ ...sales, today: 1280000 }).success).toBe(false);
  });

  it('a sales target names its month and how many days have passed', () => {
    const target = {
      month: '2026-11',
      daysInMonth: 30,
      daysElapsed: 11,
      target: '40000000.00',
      byBusiness: [],
    };
    expect(salesTargetSchema.parse(target)).toEqual(target);
    expect(salesTargetSchema.safeParse({ ...target, daysElapsed: 31 }).success).toBe(false);
    expect(salesTargetSchema.safeParse({ ...target, month: '2026-13' }).success).toBe(false);
  });

  it('dues come as aged entries, so the screen can bucket them', () => {
    const dues = {
      asOf,
      entries: [
        { ageDays: 12, amount: '2412485.00' },
        { ageDays: 75, amount: '2158539.00' },
      ],
    };
    expect(agedDuesSchema.parse(dues)).toEqual(dues);
    expect(agedDuesSchema.safeParse({ ...dues, entries: [{ ageDays: -1, amount: '1.00' }] }).success).toBe(
      false,
    );
  });

  it('the VAT return, the cash position and the bank feed', () => {
    const vat = { period: '2026-10', dueOn: '2026-11-15', estimatedPayable: '486200.00', status: 'draft' };
    expect(vatReturnSchema.parse(vat)).toEqual(vat);
    expect(vatReturnSchema.safeParse({ ...vat, status: 'late' }).success).toBe(false);
    const cash = {
      asOf,
      cashNow: '6580095.00',
      averageDailySpending: '1096682.50',
      averageDailySales: '1280000.00',
    };
    expect(cashPositionSchema.parse(cash)).toEqual(cash);
    expect(bankFeedSchema.parse({ lastSyncAt: asOf })).toEqual({ lastSyncAt: asOf });
  });

  it('monthly revenue and expenses mark an estimate; stock value at cost is optional (hidden)', () => {
    const months = {
      months: [{ month: '2026-11', revenue: '38300000.00', expenses: '32000000.00', estimate: true }],
    };
    expect(monthlyResultsSchema.parse(months)).toEqual(months);
    const stock = { asOf, unitsInStock: 46, unitsOver90Days: 4 };
    expect(stockValueSchema.parse(stock)).toEqual(stock);
    expect(stockValueSchema.parse({ ...stock, valueAtCost: '1.00' })).toMatchObject({ valueAtCost: '1.00' });
  });
});

// Provisional dashboard view shapes, second half (synthetic sample only).
describe('dashboard view shapes, second half (provisional)', () => {
  const period = { from: '2026-11-01', to: '2026-11-11' };

  it('branch results: revenue and profit per branch, money as strings; a loss is negative', () => {
    const results = {
      period,
      branches: [
        {
          branchId: '0196f000-0000-7000-8000-0000000001a1',
          branchName: 'Branch One',
          businessName: 'Sample Motors',
          revenue: '5240000.00',
          profit: '-71000.00',
        },
      ],
    };
    expect(branchResultsSchema.parse(results)).toEqual(results);
    expect(
      branchResultsSchema.safeParse({ ...results, period: { from: '2026-11-11', to: '2026-11-01' } }).success,
    ).toBe(false);
  });

  it('customer insights: who bought, how many came back, and the top customers by revenue', () => {
    const insights = {
      period,
      customersBought: 214,
      repeatCustomers: 124,
      totalRevenue: '14059500.00',
      topCustomers: [{ name: 'Sample Customer', revenue: '1240000.00' }],
    };
    expect(customerInsightsSchema.parse(insights)).toEqual(insights);
    expect(customerInsightsSchema.safeParse({ ...insights, repeatCustomers: 215 }).success).toBe(false);
  });

  it('needs action: a kind, a severity and its figures, so the screen words it in English or Bangla', () => {
    const actions = {
      items: [
        {
          id: 'a1',
          kind: 'unit_sold_not_delivered',
          severity: 'critical',
          ageDays: 6,
          amount: '134000.00',
          count: null,
          businessName: 'Sample Motors',
          branchName: 'Branch One',
        },
        {
          id: 'a2',
          kind: 'parts_below_reorder',
          severity: 'warning',
          ageDays: 2,
          amount: null,
          count: 4,
          businessName: 'Sample Spare Parts',
          branchName: 'Branch Two',
        },
      ],
    };
    expect(needsActionSchema.parse(actions)).toEqual(actions);
    expect(
      needsActionSchema.safeParse({ items: [{ ...actions.items[0], kind: 'sold_at_zero_stock' }] }).success,
    ).toBe(false);
  });

  it('day close status, with no action to close a period in it', () => {
    const close = { status: 'not_balanced', lastClosedOn: '2026-11-10', unmatchedBankItems: 2 };
    expect(dayCloseStatusSchema.parse(close)).toEqual(close);
    expect(dayCloseStatusSchema.safeParse({ ...close, status: 'closing' }).success).toBe(false);
  });

  it('unit stock by status', () => {
    const units = {
      asOf: '2026-11-12T03:00:00.000Z',
      available: 58,
      reserved: 14,
      soldNotDelivered: 7,
      over90Days: 15,
    };
    expect(unitStockSchema.parse(units)).toEqual(units);
    expect(unitStockSchema.safeParse({ ...units, available: -1 }).success).toBe(false);
  });

  it('key figure trends: two to 31 points of money per figure; a loss is allowed', () => {
    const series = ['100.00', '-20.50', '300.00'];
    const trends = {
      revenue: series,
      profit: series,
      cash: series,
      customerDues: series,
      supplierPayable: series,
    };
    expect(kpiTrendsSchema.parse(trends)).toEqual(trends);
    expect(kpiTrendsSchema.safeParse({ ...trends, cash: ['1.00'] }).success).toBe(false);
    expect(kpiTrendsSchema.safeParse({ ...trends, cash: [1, 2] }).success).toBe(false);
  });

  it('cash forecast (ADR 0047): opening by account, 4, 8 or 13 weekly buckets of the plan’s lines, Uncertain apart', () => {
    const bucket = (weekStart: string) => ({
      weekStart,
      expectedCollections: '2500000.00',
      supplierBills: '1800000.00',
      recurringExpenses: '350000.00',
      salaries: '0.00',
    });
    const forecast = {
      asOf: '2026-11-24T03:00:00.000Z',
      weeks: 4,
      opening: { cash: '1840095.00', bank: '4215000.00', mobileMoney: '525000.00' },
      buckets: ['2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12'].map(bucket),
      uncertain: '2158539.00',
    };
    expect(cashForecastSchema.parse(forecast)).toEqual(forecast);
    expect(cashForecastSchema.safeParse({ ...forecast, weeks: 6 }).success).toBe(false);
    expect(cashForecastSchema.safeParse({ ...forecast, buckets: forecast.buckets.slice(1) }).success).toBe(
      false,
    );
    expect(
      cashForecastSchema.safeParse({
        ...forecast,
        buckets: forecast.buckets.map((b) => ({ ...b, newSales: '1.00' })),
      }).data?.buckets[0],
    ).not.toHaveProperty('newSales'); // no "expected new sales" line in the plan
  });
});
