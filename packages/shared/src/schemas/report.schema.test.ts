import { describe, expect, it } from 'vitest';
import { ownerDashboardSchema } from './report.schema.js';

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
