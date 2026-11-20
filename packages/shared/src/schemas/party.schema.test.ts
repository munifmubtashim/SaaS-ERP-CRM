import { describe, expect, it } from 'vitest';
import {
  partyDetailSchema,
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

  it('carries the Bangla name, or null when there is none', () => {
    expect(partyListItemSchema.parse({ ...sample, nameBn: 'নমুনা গ্রাহক' }).nameBn).toBe('নমুনা গ্রাহক');
    expect(partyListItemSchema.parse(sample).nameBn).toBeNull();
  });

  it('requires the Bangla name key: a row without nameBn fails', () => {
    const { nameBn: _omitted, ...withoutNameBn } = sample;
    expect(partyListItemSchema.safeParse(withoutNameBn).success).toBe(false);
  });

  it('rejects an empty Bangla name: a blank one is sent as null', () => {
    expect(partyListItemSchema.safeParse({ ...sample, nameBn: '' }).success).toBe(false);
  });

  it('uses the same field rules as the full party', () => {
    const tooLongCode = { ...sample, code: 'C'.repeat(33) };
    expect(partySchema.safeParse(tooLongCode).success).toBe(false);
    expect(partyListItemSchema.safeParse(tooLongCode).success).toBe(false);
    expect(partyListItemSchema.safeParse({ ...sample, phone: '01700000001' }).success).toBe(false);
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

  it('refuses a cursor longer than 512 characters before it reaches a Query', () => {
    expect(partyListQuerySchema.safeParse({ cursor: 'a'.repeat(512) }).success).toBe(true);
    expect(partyListQuerySchema.safeParse({ cursor: 'a'.repeat(513) }).success).toBe(false);
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

describe('partyDetailSchema (customer profile, ADR 0006)', () => {
  const detail = {
    ...sample,
    nidLast4: '1234',
    creditLimit: '50000.00',
    payTermDays: 30,
    onCreditHold: false,
  };

  it('accepts a complete profile', () => {
    expect(partyDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('accepts no credit limit, no pay terms and no NID on file', () => {
    const result = partyDetailSchema.safeParse({
      ...detail,
      nidLast4: null,
      creditLimit: null,
      payTermDays: null,
    });
    expect(result.success).toBe(true);
  });

  it('strips a full national ID, so only the last four digits can reach the screen', () => {
    const parsed = partyDetailSchema.parse({ ...detail, nid: '1990000000001' });
    expect(parsed).not.toHaveProperty('nid');
  });

  it('accepts exactly four digits as nidLast4', () => {
    for (const nidLast4 of ['123', '12345', 'abcd']) {
      expect(partyDetailSchema.safeParse({ ...detail, nidLast4 }).success).toBe(false);
    }
  });

  it('takes the credit limit as a money string, never a number or a negative amount', () => {
    expect(partyDetailSchema.safeParse({ ...detail, creditLimit: 50000 }).success).toBe(false);
    expect(partyDetailSchema.safeParse({ ...detail, creditLimit: '50000' }).success).toBe(false);
    expect(partyDetailSchema.safeParse({ ...detail, creditLimit: '-1.00' }).success).toBe(false);
    expect(partyDetailSchema.safeParse({ ...detail, creditLimit: '0.00' }).success).toBe(true);
  });

  it('rejects negative or fractional pay terms', () => {
    expect(partyDetailSchema.safeParse({ ...detail, payTermDays: -1 }).success).toBe(false);
    expect(partyDetailSchema.safeParse({ ...detail, payTermDays: 1.5 }).success).toBe(false);
  });

  it('keeps the rule that a party is a customer, a supplier or both', () => {
    const result = partyDetailSchema.safeParse({ ...detail, isCustomer: false, isSupplier: false });
    expect(result.success).toBe(false);
  });
});
