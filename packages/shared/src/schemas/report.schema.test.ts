import { describe, expect, it } from 'vitest';
import {
  agedDuesSchema,
  bankFeedSchema,
  cashPositionSchema,
  monthlyResultsSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
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
