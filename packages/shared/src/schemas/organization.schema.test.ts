import { describe, expect, it } from 'vitest';
import { activeScopeSchema, myBusinessesResponseSchema } from './organization.schema.js';

// Obviously fake sample data only.
const BIZ = '0196f000-0000-7000-8000-0000000000a1';
const BRANCH = '0196f000-0000-7000-8000-0000000000a2';

describe('organization schemas', () => {
  const business = { id: BIZ, name: 'Demo Motors', branches: [{ id: BRANCH, name: 'Demo Branch North' }] };

  it('lists the businesses a user may use, each with at least one branch', () => {
    expect(myBusinessesResponseSchema.safeParse({ items: [business] }).success).toBe(true);
    expect(myBusinessesResponseSchema.safeParse({ items: [{ ...business, branches: [] }] }).success).toBe(
      false,
    );
  });

  it('an active scope is one business and one branch', () => {
    expect(activeScopeSchema.safeParse({ businessId: BIZ, branchId: BRANCH }).success).toBe(true);
    expect(activeScopeSchema.safeParse({ businessId: BIZ }).success).toBe(false);
  });
});
