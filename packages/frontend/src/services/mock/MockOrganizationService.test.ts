import { myBusinessesResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { MockOrganizationService } from './MockOrganizationService';

describe('MockOrganizationService (stands in for GET /v1/me/businesses)', () => {
  it('returns two sample businesses with two branches each, in the shared shape', async () => {
    const result = await new MockOrganizationService(0).myBusinesses();
    expect(myBusinessesResponseSchema.safeParse(result).success).toBe(true);
    expect(result.items.map((b) => b.name)).toEqual(['Demo Motors', 'Sample Traders']);
    expect(result.items.map((b) => b.branches.length)).toEqual([2, 2]);
  });
});
