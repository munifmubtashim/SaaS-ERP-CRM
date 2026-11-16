import { ownerDashboardSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { MockReportService } from './MockReportService';

describe('MockReportService (stands in for GET /v1/reports/owner-dashboard)', () => {
  it('returns sample figures for two businesses in the shared shape, with totals that match the rows', async () => {
    const dashboard = await new MockReportService(0).ownerDashboard();
    expect(ownerDashboardSchema.safeParse(dashboard).success).toBe(true);
    expect(dashboard.businesses.map((b) => b.name)).toEqual(['Demo Motors', 'Sample Traders']);
    // Checked by hand: 1234567.50 + 387250.00 and 45000.00 + 12500.00.
    expect(dashboard.totals).toEqual({ dues: '1621817.50', collectionsToday: '57500.00' });
  });
});
