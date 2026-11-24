import { ownerDashboardSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IClock } from './contracts/IClock.js';
import type { DashboardRow, IReportQuery } from './contracts/IReportQuery.js';
import { ReportManager } from './ReportManager.js';

/**
 * ADR 0023 section 2 (amended 24 Nov), the Manager's part: totals are the sum of the business rows through the shared
 * money helpers; asOf is when the query ran; stock value is a cost figure, null in every row and the totals for a
 * caller without product.cost.view (plan 2.5). The figures themselves are tested against the ledger in dal.
 */
const clock: IClock = { now: () => new Date('2026-11-24T08:15:00.000Z') };
const rows: DashboardRow[] = [
  {
    businessId: '0196f000-0000-7000-8000-0000000000a1',
    name: 'Sample Motors',
    dues: '120000.50',
    collectionsToday: '45000.00',
    revenueMonth: '850000.00',
    stockValue: '2400000.00',
  },
  {
    businessId: '0196f000-0000-7000-8000-0000000000a2',
    name: 'Sample Service Centre',
    dues: '-0.50',
    collectionsToday: '5000.25',
    revenueMonth: '0.00',
    stockValue: '100.00',
  },
];
const query: IReportQuery = { ownerDashboard: async () => rows };

describe('ReportManager.ownerDashboard', () => {
  it('totals are the sum of the rows, money as strings, and the answer matches the shared schema', async () => {
    const dashboard = await new ReportManager(query, clock).ownerDashboard({ canSeeCost: true });
    expect(dashboard.asOf).toBe('2026-11-24T08:15:00.000Z');
    expect(dashboard.totals).toEqual({
      dues: '120000.00',
      collectionsToday: '50000.25',
      revenueMonth: '850000.00',
      stockValue: '2400100.00',
    });
    expect(dashboard.businesses).toEqual(rows);
    expect(ownerDashboardSchema.safeParse(dashboard).success).toBe(true);
  });

  it('without product.cost.view, stock value is null in every row and the totals', async () => {
    const dashboard = await new ReportManager(query, clock).ownerDashboard({ canSeeCost: false });
    expect(dashboard.totals.stockValue).toBeNull();
    expect(dashboard.businesses.map((b) => b.stockValue)).toEqual([null, null]);
    expect(JSON.stringify(dashboard)).not.toContain('2400000.00');
  });

  it('no businesses in scope: an empty list and zero totals', async () => {
    const empty = await new ReportManager({ ownerDashboard: async () => [] }, clock).ownerDashboard({
      canSeeCost: true,
    });
    expect(empty).toMatchObject({
      totals: { dues: '0.00', collectionsToday: '0.00', revenueMonth: '0.00', stockValue: '0.00' },
      businesses: [],
    });
  });
});
