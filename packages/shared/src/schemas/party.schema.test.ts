import { describe, expect, it } from 'vitest';
import {
  createPartySchema,
  partyListItemSchema,
  partyListQuerySchema,
  partyListResponseSchema,
  partySchema,
  updatePartySchema,
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

// ADR 0056 section 3: the create and update payloads. Synthetic values only.
const create = {
  name: 'Sample Customer',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: '01700000001',
  altPhone: null,
  email: null,
  address: null,
  area: null,
  creditLimit: null,
  payTermDays: null,
};

describe('createPartySchema (ADR 0056 section 3)', () => {
  it('accepts a customer, normalises the phone to E.164, and defaults confirmDuplicate to false', () => {
    const parsed = createPartySchema.parse(create);
    expect(parsed.phone).toBe('+8801700000001');
    expect(parsed.confirmDuplicate).toBe(false);
  });

  it('normalises the alternative phone too, and refuses a number that is not a mobile', () => {
    expect(createPartySchema.parse({ ...create, altPhone: '8801800000002' }).altPhone).toBe('+8801800000002');
    expect(createPartySchema.safeParse({ ...create, phone: '0171234567' }).success).toBe(false);
    expect(createPartySchema.safeParse({ ...create, phone: '01212345678' }).success).toBe(false);
  });

  it.each(['id', 'businessId', 'code', 'status', 'version', 'createdBy', 'createdAt'])(
    'refuses %s in the body: it comes from the server',
    (key) => {
      expect(createPartySchema.safeParse({ ...create, [key]: 'x' }).success).toBe(false);
    },
  );

  it('needs a customer, a supplier or both', () => {
    expect(createPartySchema.safeParse({ ...create, isCustomer: false }).success).toBe(false);
  });

  it('takes a credit limit as a money string, zero or more, and pay terms of 0 to 365 days', () => {
    expect(createPartySchema.safeParse({ ...create, creditLimit: '50000.00' }).success).toBe(true);
    expect(createPartySchema.safeParse({ ...create, creditLimit: '0.00' }).success).toBe(true);
    expect(createPartySchema.safeParse({ ...create, creditLimit: '-1.00' }).success).toBe(false);
    expect(createPartySchema.safeParse({ ...create, creditLimit: 50000 }).success).toBe(false);
    expect(createPartySchema.safeParse({ ...create, payTermDays: 366 }).success).toBe(false);
  });

  it('turns a blank Bangla name into null', () => {
    expect(createPartySchema.parse({ ...create, nameBn: '  ' }).nameBn).toBeNull();
  });
});

describe('updatePartySchema (ADR 0056 section 3)', () => {
  it('needs the version read, and every other field is optional', () => {
    expect(updatePartySchema.safeParse({ version: 3 }).success).toBe(true);
    expect(updatePartySchema.safeParse({ name: 'Renamed Customer' }).success).toBe(false);
  });

  it('normalises a changed phone and refuses the fields that never change by edit', () => {
    expect(updatePartySchema.parse({ version: 1, phone: '+8801700000003' }).phone).toBe('+8801700000003');
    for (const key of ['id', 'businessId', 'code', 'status', 'createdBy']) {
      expect(updatePartySchema.safeParse({ version: 1, [key]: 'x' }).success).toBe(false);
    }
  });

  it('refuses an edit that leaves the party neither a customer nor a supplier', () => {
    expect(updatePartySchema.safeParse({ version: 1, isCustomer: false, isSupplier: false }).success).toBe(
      false,
    );
  });
});
