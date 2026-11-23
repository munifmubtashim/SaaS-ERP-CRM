import { describe, expect, it } from 'vitest';
import { tenantHeadersSchema, tenantScopeSchema } from './tenant.schema.js';

// Synthetic ids only.
const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ = '0196f000-0000-7000-8000-0000000000a1';
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';
const BRANCH_2 = '0196f000-0000-7000-8000-0000000002a1';
const OTHER_BRANCH = '0196f000-0000-7000-8000-0000000001b1';

describe('tenantScopeSchema (ADR 0005)', () => {
  it('accepts an organization, at least one business and at least one branch', () => {
    const scope = { organizationId: ORG, businessIds: [BIZ], branchIds: [BRANCH] };
    expect(tenantScopeSchema.parse(scope)).toEqual(scope);
  });

  it('rejects a scope with no branch list: an unset list never means "all branches"', () => {
    expect(tenantScopeSchema.safeParse({ organizationId: ORG, businessIds: [BIZ] }).success).toBe(false);
  });

  it('rejects an empty branch list', () => {
    const scope = { organizationId: ORG, businessIds: [BIZ], branchIds: [] };
    expect(tenantScopeSchema.safeParse(scope).success).toBe(false);
  });

  it('rejects a branch id that is not a UUID (a comma could add a branch)', () => {
    const scope = { organizationId: ORG, businessIds: [BIZ], branchIds: [`${BRANCH},${BRANCH}`] };
    expect(tenantScopeSchema.safeParse(scope).success).toBe(false);
  });
});

describe('tenantScopeSchema: the branch a write goes to (ADR 0007 step 6)', () => {
  it('accepts a branchId that is one of branchIds', () => {
    const scope = {
      organizationId: ORG,
      businessIds: [BIZ],
      branchIds: [BRANCH, BRANCH_2],
      branchId: BRANCH_2,
    };
    expect(tenantScopeSchema.parse(scope)).toEqual(scope);
  });

  it('leaves branchId out when the route needs no branch', () => {
    const scope = { organizationId: ORG, businessIds: [BIZ], branchIds: [BRANCH] };
    expect(tenantScopeSchema.parse(scope).branchId).toBeUndefined();
  });

  it('rejects a branchId that is not one of branchIds', () => {
    const scope = { organizationId: ORG, businessIds: [BIZ], branchIds: [BRANCH], branchId: OTHER_BRANCH };
    const result = tenantScopeSchema.safeParse(scope);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['branchId']);
  });

  it('rejects a branchId that is not a UUID', () => {
    const scope = { organizationId: ORG, businessIds: [BIZ], branchIds: [BRANCH], branchId: 'branch-1' };
    expect(tenantScopeSchema.safeParse(scope).success).toBe(false);
  });
});

describe('tenantHeadersSchema: X-Business-Id and X-Branch-Id on a tenant route (ADR 0051)', () => {
  const business = '0196f000-0000-7000-8000-0000000000a1';
  const branch = '0196f000-0000-7000-8000-0000000001a1';

  it('accepts one business id and one branch id', () => {
    expect(tenantHeadersSchema.parse({ businessId: business, branchId: branch })).toEqual({
      businessId: business,
      branchId: branch,
    });
  });

  it('refuses a missing, malformed or listed id', () => {
    for (const bad of [
      { businessId: business },
      { branchId: branch },
      { businessId: 'not-a-uuid', branchId: branch },
      { businessId: `${business},${business}`, branchId: branch },
    ]) {
      expect(tenantHeadersSchema.safeParse(bad).success).toBe(false);
    }
  });
});
