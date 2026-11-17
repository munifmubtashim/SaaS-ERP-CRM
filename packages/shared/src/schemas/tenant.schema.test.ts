import { describe, expect, it } from 'vitest';
import { tenantScopeSchema } from './tenant.schema.js';

// Synthetic ids only.
const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ = '0196f000-0000-7000-8000-0000000000a1';
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';

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
