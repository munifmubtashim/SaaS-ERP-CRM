import { describe, expect, it } from 'vitest';
import { postedInvoiceSchema, postInvoiceSchema } from './sales.schema.js';

/**
 * The invoice posting payload and answer (ADR 0022 sections 1 and 2; ADR 0016 for payments at the sale). Money and
 * quantities are strings, never numbers; the client sends no price and no cost (prices come from the product, P-07).
 */
const PRODUCT = '01937000-0000-7000-8000-0000000000f0';
const UNIT = '01937000-0000-7000-8000-0000000000a9';
const PARTY = '01937000-0000-7000-8000-0000000000c1';

const valid = {
  partyId: PARTY,
  customerName: 'Rahim Uddin',
  lines: [{ productId: PRODUCT, serialUnitId: null, qty: '2.000' }],
  discount: '0.00',
  payments: [
    { method: 'cash', amount: '1000.00', externalRef: null },
    { method: 'bkash', amount: '300.00', externalRef: 'TX8K2M4' },
  ],
};

describe('postInvoiceSchema', () => {
  it('accepts a counter sale paid part in cash and part by bKash', () => {
    expect(postInvoiceSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a walk-in sale with nothing paid (all due) and a serial unit', () => {
    const sale = {
      ...valid,
      customerName: null,
      payments: [],
      lines: [{ productId: PRODUCT, serialUnitId: UNIT, qty: '1' }],
    };
    expect(postInvoiceSchema.safeParse(sale).success).toBe(true);
  });

  it.each([
    ['no lines', { lines: [] }],
    ['money sent as a number', { discount: 0 }],
    ['a negative discount', { discount: '-1.00' }],
    ['a quantity sent as a number', { lines: [{ productId: PRODUCT, serialUnitId: null, qty: 2 }] }],
    ['a zero quantity', { lines: [{ productId: PRODUCT, serialUnitId: null, qty: '0.000' }] }],
    ['four quantity decimals', { lines: [{ productId: PRODUCT, serialUnitId: null, qty: '1.0001' }] }],
    ['a serial unit with quantity 2', { lines: [{ productId: PRODUCT, serialUnitId: UNIT, qty: '2' }] }],
    [
      'a price from the client',
      { lines: [{ productId: PRODUCT, serialUnitId: null, qty: '1', unitPrice: '1.00' }] },
    ],
    [
      'a cost from the client',
      { lines: [{ productId: PRODUCT, serialUnitId: null, qty: '1', costAmount: '1.00' }] },
    ],
    ['"due" as a payment method', { payments: [{ method: 'due', amount: '1.00', externalRef: null }] }],
    [
      'bKash without its transaction id',
      { payments: [{ method: 'bkash', amount: '1.00', externalRef: null }] },
    ],
    ['a zero payment', { payments: [{ method: 'cash', amount: '0.00', externalRef: null }] }],
    ['a party id that is not a uuid', { partyId: 'walk-in' }],
    ['a business date from the client', { invoiceDate: '2026-11-24' }],
  ])('refuses %s', (_case, change) => {
    expect(postInvoiceSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('postedInvoiceSchema', () => {
  const answer = {
    id: '01937000-0000-7000-8000-0000000000d1',
    number: 'INV-UTT-000123',
    invoiceDate: '2026-11-24',
    partyId: PARTY,
    customerName: 'Rahim Uddin',
    subtotal: '2000.00',
    discount: '0.00',
    total: '2000.00',
    paid: '1300.00',
    due: '700.00',
    status: 'posted',
    lines: [
      {
        lineNo: 1,
        productId: PRODUCT,
        serialUnitId: null,
        qty: '2.000',
        unitPrice: '1000.00',
        lineTotal: '2000.00',
      },
    ],
    payments: [
      {
        id: '01937000-0000-7000-8000-0000000000d2',
        receiptNumber: 'R-UTT-000201',
        method: 'cash',
        amount: '1000.00',
        externalRef: null,
      },
    ],
  };

  it('accepts the answer to a posted sale', () => {
    expect(postedInvoiceSchema.safeParse(answer).success).toBe(true);
  });

  it('never carries a unit cost (hidden field, plan 2.5)', () => {
    const withCost = { ...answer, lines: [{ ...answer.lines[0], costAmount: '1400.00' }] };
    expect(postedInvoiceSchema.safeParse(withCost).success).toBe(false);
  });
});
