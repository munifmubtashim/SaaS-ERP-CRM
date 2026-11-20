import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { authContextSchema, tenantScopeSchema } from './tenant.schema.js';

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

describe('tenantScopeSchema: the business list and the organization', () => {
  it('rejects an empty business list: it would become an empty SET LOCAL value', () => {
    const scope = { organizationId: ORG, businessIds: [], branchIds: [BRANCH] };
    expect(tenantScopeSchema.safeParse(scope).success).toBe(false);
  });

  it('rejects a business id that is not a UUID', () => {
    const scope = { organizationId: ORG, businessIds: [`${BIZ},${BIZ}`], branchIds: [BRANCH] };
    expect(tenantScopeSchema.safeParse(scope).success).toBe(false);
  });

  it('rejects a scope without an organization', () => {
    expect(tenantScopeSchema.safeParse({ businessIds: [BIZ], branchIds: [BRANCH] }).success).toBe(false);
  });

  it('accepts a branchId exactly when it is in branchIds (property)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 6 }),
        fc.uuid(),
        fc.boolean(),
        (ids, other, pick) => {
          const branchId = pick ? ids[0] : other;
          const result = tenantScopeSchema.safeParse({
            organizationId: ORG,
            businessIds: [BIZ],
            branchIds: ids,
            branchId,
          });
          return result.success === ids.includes(branchId as string);
        },
      ),
    );
  });
});

describe('authContextSchema', () => {
  const USER = '0196f000-0000-7000-8000-000000000001';

  it('accepts a user, an organization and a role list, which may be empty', () => {
    expect(authContextSchema.parse({ userId: USER, organizationId: ORG, roles: [] })).toEqual({
      userId: USER,
      organizationId: ORG,
      roles: [],
    });
  });

  it('rejects ids that are not UUIDs and a missing role list', () => {
    expect(authContextSchema.safeParse({ userId: 'u1', organizationId: ORG, roles: [] }).success).toBe(false);
    expect(authContextSchema.safeParse({ userId: USER, organizationId: 'o1', roles: [] }).success).toBe(
      false,
    );
    expect(authContextSchema.safeParse({ userId: USER, organizationId: ORG }).success).toBe(false);
  });
});
