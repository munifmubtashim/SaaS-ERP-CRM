import { describe, expect, it } from 'vitest';
import { ownerDashboardSchema } from './report.schema.js';

// Obviously fake sample data only.
const BIZ = '0196f000-0000-7000-8000-0000000000a1';

const figures = {
  dues: '1234567.50',
  collectionsToday: '45000.00',
  revenueMonth: '850000.00',
  stockValue: '2400000.00',
};

describe('ownerDashboardSchema (ADR 0023, amended 24 Nov: revenue month to date, stock value)', () => {
  const dashboard = {
    asOf: '2026-11-16T10:00:00.000Z',
    totals: figures,
    businesses: [{ businessId: BIZ, name: 'Demo Motors', ...figures }],
  };

  it('accepts money as two-decimal strings', () => {
    expect(ownerDashboardSchema.safeParse(dashboard).success).toBe(true);
  });

  it('rejects money sent as a number', () => {
    expect(
      ownerDashboardSchema.safeParse({ ...dashboard, totals: { ...figures, dues: 1234567.5 } }).success,
    ).toBe(false);
    expect(
      ownerDashboardSchema.safeParse({ ...dashboard, totals: { ...figures, revenueMonth: 850000 } }).success,
    ).toBe(false);
  });

  it('stock value is null for a caller without product.cost.view (a hidden figure, plan 2.5)', () => {
    const hidden = { ...figures, stockValue: null };
    expect(
      ownerDashboardSchema.safeParse({
        ...dashboard,
        totals: hidden,
        businesses: [{ businessId: BIZ, name: 'Demo Motors', ...hidden }],
      }).success,
    ).toBe(true);
  });

  it('revenue month to date is required', () => {
    const { revenueMonth: _left, ...withoutRevenue } = figures;
    expect(ownerDashboardSchema.safeParse({ ...dashboard, totals: withoutRevenue }).success).toBe(false);
  });

  it('allows an empty business list (the empty state)', () => {
    const zero = { dues: '0.00', collectionsToday: '0.00', revenueMonth: '0.00', stockValue: '0.00' };
    expect(ownerDashboardSchema.safeParse({ ...dashboard, totals: zero, businesses: [] }).success).toBe(true);
  });
});
