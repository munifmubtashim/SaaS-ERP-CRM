import { describe, expect, it } from 'vitest';
import {
  invoiceDetailSchema,
  invoiceSummarySchema,
  paymentDraftSchema,
  paymentMethodSchema,
  posItemSchema,
  saleDraftSchema,
  postedInvoiceSchema,
  postInvoiceSchema,
} from './sales.schema.js';

// Synthetic sample only. Provisional view shapes for the Sales / POS screen.
const item = {
  id: 'velo-150',
  name: 'Velo 150 V3',
  category: 'Bikes',
  kind: 'serial',
  price: '245000.00',
  available: '2',
  serialNumbers: ['VL3-000101', 'VL3-000102'],
};

describe('Sales / POS view shapes (provisional)', () => {
  it('a POS item has its price as a money string; a number is refused', () => {
    expect(posItemSchema.parse(item)).toEqual(item);
    expect(posItemSchema.safeParse({ ...item, price: 245000 }).success).toBe(false);
  });

  it('a sale draft needs at least one line; a serial-tracked line names its serial number', () => {
    const line = {
      itemId: 'velo-150',
      name: 'Velo 150 V3',
      unitPrice: '245000.00',
      quantity: '1',
      serialNumber: 'VL3-000101',
    };
    const draft = {
      customerName: null,
      lines: [line],
      discount: '0.00',
      payment: { method: 'cash', amount: '245000.00', externalRef: null },
    };
    expect(saleDraftSchema.parse(draft)).toEqual(draft);
    expect(saleDraftSchema.safeParse({ ...draft, lines: [] }).success).toBe(false);
    expect(
      saleDraftSchema.safeParse({
        ...draft,
        payment: { method: 'cheque', amount: '1.00', externalRef: null },
      }).success,
    ).toBe(false);
  });

  it('an invoice is paid, partly paid or due; its detail carries lines, payments and the balance', () => {
    const summary = {
      number: 'INV-261113-014',
      issuedAt: '2026-11-13T06:40:00.000Z',
      customerName: 'Walk-in customer',
      total: '254000.00',
      paid: '100000.00',
      status: 'partly_paid',
    };
    expect(invoiceSummarySchema.parse(summary)).toEqual(summary);
    expect(invoiceSummarySchema.safeParse({ ...summary, status: 'overdue' }).success).toBe(false);
    const detail = {
      ...summary,
      soldBy: 'Counter 1',
      lines: [
        {
          description: 'Velo 150 V3, VL3-000101',
          quantity: '1',
          unitPrice: '245000.00',
          amount: '245000.00',
        },
      ],
      discount: '0.00',
      payments: [
        {
          receivedAt: '2026-11-13T06:42:00.000Z',
          receiptNumber: 'R-000201',
          method: 'bkash',
          amount: '100000.00',
          externalRef: 'BK7X2Q9',
        },
      ],
      balance: '154000.00',
    };
    expect(invoiceDetailSchema.parse(detail)).toEqual(detail);
    // Every payment has a system receipt number (ADR 0016 line 19).
    const noReceipt = { ...detail, payments: detail.payments.map(({ receiptNumber: _r, ...p }) => p) };
    expect(invoiceDetailSchema.safeParse(noReceipt).success).toBe(false);
  });

  it('payment methods are the plan’s four, all entered by hand (ADR 0016 lines 18 and 64)', () => {
    expect(paymentMethodSchema.options).toEqual(['cash', 'bank', 'bkash', 'card']);
  });

  it('Bank, bKash and Card need the external transaction id; Cash does not (ADR 0016 lines 20, 36, 104)', () => {
    const cash = { method: 'cash', amount: '500.00', externalRef: null };
    expect(paymentDraftSchema.parse(cash)).toEqual(cash);
    expect(paymentDraftSchema.safeParse({ ...cash, method: 'bkash' }).success).toBe(false);
    expect(paymentDraftSchema.safeParse({ ...cash, method: 'bkash', externalRef: '   ' }).success).toBe(
      false,
    );
    expect(paymentDraftSchema.parse({ ...cash, method: 'bkash', externalRef: ' BK7X2Q9 ' }).externalRef).toBe(
      'BK7X2Q9',
    );
    expect(paymentDraftSchema.safeParse({ ...cash, method: 'card' }).success).toBe(false);
    expect(paymentDraftSchema.safeParse({ ...cash, amount: '0.00' }).success).toBe(false);
  });
});

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
