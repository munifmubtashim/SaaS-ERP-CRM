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

describe('ownerDashboardSchema boundaries', () => {
  const row = { businessId: BIZ, name: 'Demo Motors', dues: '0.00', collectionsToday: '0.00' };
  const base = { asOf: '2026-11-16T10:00:00.000Z', totals: { dues: '0.00', collectionsToday: '0.00' } };

  it('refuses money as a number in a business row, not only in the totals', () => {
    expect(ownerDashboardSchema.safeParse({ ...base, businesses: [{ ...row, dues: 0 }] }).success).toBe(
      false,
    );
  });

  it('refuses money with one decimal or none', () => {
    for (const dues of ['100', '100.5']) {
      expect(
        ownerDashboardSchema.safeParse({ ...base, totals: { ...base.totals, dues } }).success,
        dues,
      ).toBe(false);
    }
  });

  it('allows negative dues, which is a customer in credit', () => {
    expect(
      ownerDashboardSchema.safeParse({ ...base, totals: { ...base.totals, dues: '-500.00' }, businesses: [] })
        .success,
    ).toBe(true);
  });

  it('takes asOf in UTC only', () => {
    expect(
      ownerDashboardSchema.safeParse({ ...base, asOf: '2026-11-16T16:00:00+06:00', businesses: [] }).success,
    ).toBe(false);
  });

  it('requires a business name of 1 to 200 characters and a UUID id', () => {
    for (const bad of [{ name: '' }, { name: 'x'.repeat(201) }, { businessId: 'not-a-uuid' }]) {
      expect(
        ownerDashboardSchema.safeParse({ ...base, businesses: [{ ...row, ...bad }] }).success,
        JSON.stringify(bad).slice(0, 40),
      ).toBe(false);
    }
    expect(
      ownerDashboardSchema.safeParse({ ...base, businesses: [{ ...row, name: 'x'.repeat(200) }] }).success,
    ).toBe(true);
  });
});
