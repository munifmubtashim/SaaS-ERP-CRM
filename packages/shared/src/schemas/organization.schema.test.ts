import { describe, expect, it } from 'vitest';
import {
  activeScopeSchema,
  branchShortCodeSchema,
  createBranchSchema,
  createBusinessSchema,
  myBusinessesResponseSchema,
} from './organization.schema.js';

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

describe('branchShortCodeSchema (ADR 0009, ADR 0010 part 2): the same rule as the database CHECK', () => {
  it.each(['UTT', 'AG2', 'AB', 'ABCDEF'])('accepts %s', (code) => {
    expect(branchShortCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(['utt', 'U', 'TOOLONG', 'U-T', '2UT', ' UTT', ''])('refuses %j, never changing it', (code) => {
    expect(branchShortCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('createBusinessSchema and createBranchSchema (ADR 0010)', () => {
  const legalEntityId = '01937000-0000-7000-8000-000000000001';

  it('drops any organizationId in the body: the organization always comes from the session', () => {
    const parsed = createBusinessSchema.parse({
      legalEntityId,
      name: 'Demo Motors',
      organizationId: '01937000-0000-7000-8000-0000000000ff',
    });
    expect(parsed).toEqual({ legalEntityId, name: 'Demo Motors' });
  });

  it('trims the business name and refuses an empty one', () => {
    expect(createBusinessSchema.parse({ legalEntityId, name: '  Demo Motors  ' }).name).toBe('Demo Motors');
    expect(createBusinessSchema.safeParse({ legalEntityId, name: '   ' }).success).toBe(false);
  });

  it('a branch needs a valid short code', () => {
    expect(createBranchSchema.safeParse({ name: 'Uttara', shortCode: 'UTT' }).success).toBe(true);
    expect(createBranchSchema.safeParse({ name: 'Uttara', shortCode: 'utt' }).success).toBe(false);
    expect(createBranchSchema.safeParse({ name: 'Uttara' }).success).toBe(false);
  });
});
