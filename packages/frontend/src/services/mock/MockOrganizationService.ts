import type { MyBusinessesResponse } from '@erp/shared';
import type { IOrganizationService } from '../organizationService';

/** Obviously fake sample businesses and branches; removed when the M2 API lands. */
const SAMPLE: MyBusinessesResponse = {
  items: [
    {
      id: '0196f000-0000-7000-8000-0000000000a1',
      name: 'Demo Motors',
      branches: [
        { id: '0196f000-0000-7000-8000-0000000000a2', name: 'Demo Branch North' },
        { id: '0196f000-0000-7000-8000-0000000000a3', name: 'Demo Branch South' },
      ],
    },
    {
      id: '0196f000-0000-7000-8000-0000000000b1',
      name: 'Sample Traders',
      branches: [
        { id: '0196f000-0000-7000-8000-0000000000b2', name: 'Sample Branch East' },
        { id: '0196f000-0000-7000-8000-0000000000b3', name: 'Sample Branch West' },
      ],
    },
  ],
};

/** Stands in for GET /v1/me/businesses until M2. Same contract as OrganizationService. */
export class MockOrganizationService implements IOrganizationService {
  constructor(private readonly delayMs = 300) {}

  async myBusinesses(): Promise<MyBusinessesResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return SAMPLE;
  }
}
