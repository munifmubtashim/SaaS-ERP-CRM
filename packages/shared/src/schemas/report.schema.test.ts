import { describe, expect, it } from 'vitest';
import {
  branchResultsSchema,
  customerInsightsSchema,
  dayCloseStatusSchema,
  needsActionSchema,
  ownerDashboardSchema,
  unitStockSchema,
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
});
