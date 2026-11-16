import type { OwnerDashboard } from '@erp/shared';
import type { IReportService } from '../reportService';

/** Stands in for GET /v1/reports/owner-dashboard until M6. Obviously fake sample figures. */
export class MockReportService implements IReportService {
  constructor(private readonly delayMs = 500) {}

  async ownerDashboard(): Promise<OwnerDashboard> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return {
      asOf: new Date().toISOString(),
      // The totals are the sums of the rows below, written out: no money arithmetic outside shared utils.
      totals: { dues: '1621817.50', collectionsToday: '57500.00' },
      businesses: [
        {
          businessId: '0196f000-0000-7000-8000-0000000000a1',
          name: 'Demo Motors',
          dues: '1234567.50',
          collectionsToday: '45000.00',
        },
        {
          businessId: '0196f000-0000-7000-8000-0000000000b1',
          name: 'Sample Traders',
          dues: '387250.00',
          collectionsToday: '12500.00',
        },
      ],
    };
  }
}
