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

describe('organization schema boundaries', () => {
  const branch = { id: BRANCH, name: 'Demo Branch North' };

  it('requires UUID ids for the business and each branch', () => {
    expect(activeScopeSchema.safeParse({ businessId: 'biz-1', branchId: BRANCH }).success).toBe(false);
    expect(
      myBusinessesResponseSchema.safeParse({
        items: [{ id: BIZ, name: 'Demo Motors', branches: [{ ...branch, id: '42' }] }],
      }).success,
    ).toBe(false);
  });

  it('requires names of 1 to 200 characters', () => {
    for (const name of ['', 'x'.repeat(201)]) {
      expect(
        myBusinessesResponseSchema.safeParse({ items: [{ id: BIZ, name, branches: [branch] }] }).success,
        `length ${name.length}`,
      ).toBe(false);
    }
  });

  it('allows a user with no businesses yet (the empty state)', () => {
    expect(myBusinessesResponseSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('drops unknown keys from the active scope, so a client cannot add an organization id', () => {
    expect(activeScopeSchema.parse({ businessId: BIZ, branchId: BRANCH, organizationId: BIZ })).toEqual({
      businessId: BIZ,
      branchId: BRANCH,
    });
  });
});
