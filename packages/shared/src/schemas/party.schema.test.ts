import { describe, expect, it } from 'vitest';
import {
  partyListItemSchema,
  partyListQuerySchema,
  partyListResponseSchema,
  partySchema,
} from './party.schema.js';

// Synthetic sample only: no real person, phone number or business.
const sample = {
  id: '0196f000-0000-7000-8000-000000000101',
  businessId: '0196f000-0000-7000-8000-0000000000a1',
  code: 'C-0001',
  name: 'Sample Customer One',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: '+8801700000001',
  altPhone: null,
  email: null,
  address: 'Sample Road 1',
  area: 'Sample Area',
  status: 'active',
  createdAt: '2026-11-16T04:00:00.000Z',
  updatedAt: '2026-11-16T04:00:00.000Z',
  version: 1,
};

describe('partySchema', () => {
  it('accepts a complete party', () => {
    expect(partySchema.safeParse(sample).success).toBe(true);
  });

  it('rejects a party that is neither a customer nor a supplier', () => {
    const result = partySchema.safeParse({ ...sample, isCustomer: false, isSupplier: false });
    expect(result.success).toBe(false);
  });

  it('accepts phones only in E.164 form (normalising is the form’s job)', () => {
    expect(partySchema.safeParse({ ...sample, phone: '01700000001' }).success).toBe(false);
    expect(partySchema.safeParse({ ...sample, altPhone: '+8801800000002' }).success).toBe(true);
  });

  it('rejects an unknown kind or status', () => {
    expect(partySchema.safeParse({ ...sample, kind: 'robot' }).success).toBe(false);
    expect(partySchema.safeParse({ ...sample, status: 'deleted' }).success).toBe(false);
  });
});

describe('partyListItemSchema', () => {
  it('keeps only list fields and never carries a national ID', () => {
    const parsed = partyListItemSchema.parse({ ...sample, nid: '0000000000' });
    expect(parsed).not.toHaveProperty('nid');
    expect(parsed).not.toHaveProperty('address');
    expect(parsed).toMatchObject({ id: sample.id, code: 'C-0001', phone: '+8801700000001' });
  });
});

describe('partyListQuerySchema', () => {
  it('defaults the page size and reads numbers from the query string', () => {
    expect(partyListQuerySchema.parse({}).limit).toBe(25);
    expect(partyListQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('keeps the page size between 1 and 100', () => {
    expect(partyListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(partyListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('trims the search text and treats blank as no search', () => {
    expect(partyListQuerySchema.parse({ search: '  one ' }).search).toBe('one');
    expect(partyListQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
  });

  it('filters by role', () => {
    expect(partyListQuerySchema.parse({ role: 'customer' }).role).toBe('customer');
    expect(partyListQuerySchema.safeParse({ role: 'staff' }).success).toBe(false);
  });
});

describe('partyListResponseSchema', () => {
  it('is a cursor page: items plus the next cursor, or null on the last page', () => {
    const item = partyListItemSchema.parse(sample);
    expect(partyListResponseSchema.safeParse({ items: [item], nextCursor: null }).success).toBe(true);
    expect(partyListResponseSchema.safeParse({ items: [item], nextCursor: 'abc' }).success).toBe(true);
    expect(partyListResponseSchema.safeParse({ items: [{ id: 'x' }], nextCursor: null }).success).toBe(false);
  });
});
