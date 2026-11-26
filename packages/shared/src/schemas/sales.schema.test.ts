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
  customerDuesSchema,
  recordPaymentSchema,
  salesPaymentListResponseSchema,
  salesPaymentSchema,

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

// Synthetic sample only: no real person, receipt or business.
const partyId = '0196f000-0000-7000-8000-000000000101';
const invoiceId = '0196f000-0000-7000-8000-000000000201';

const cashPayment = {
  partyId,
  invoiceId,
  method: 'cash',
  amount: '12500.00',
  externalRef: null,
  note: null,
};

describe('paymentMethodSchema (ADR 0016 draft: Cash, Bank, bKash, Card)', () => {
  it('accepts the four methods and nothing else', () => {
    for (const method of ['cash', 'bank', 'bkash', 'card']) {
      expect(paymentMethodSchema.safeParse(method).success).toBe(true);
    }
    expect(paymentMethodSchema.safeParse('nagad').success).toBe(false);
  });
});

describe('recordPaymentSchema (the payment entry form)', () => {
  it('accepts a cash payment against an invoice', () => {
    expect(recordPaymentSchema.safeParse(cashPayment).success).toBe(true);
  });

  it('accepts an advance: no invoice yet', () => {
    expect(recordPaymentSchema.safeParse({ ...cashPayment, invoiceId: null }).success).toBe(true);
  });

  it('takes the amount as a money string with two decimals, never a number', () => {
    expect(recordPaymentSchema.safeParse({ ...cashPayment, amount: 12500 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...cashPayment, amount: '12500' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...cashPayment, amount: '12500.5' }).success).toBe(false);
  });

  it('refuses a zero or negative amount', () => {
    for (const amount of ['0.00', '-100.00']) {
      const result = recordPaymentSchema.safeParse({ ...cashPayment, amount });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['amount']);
    }
  });

  it('needs the external transaction id for Bank, bKash and Card', () => {
    for (const method of ['bank', 'bkash', 'card']) {
      const result = recordPaymentSchema.safeParse({ ...cashPayment, method });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['externalRef']);
      expect(recordPaymentSchema.safeParse({ ...cashPayment, method, externalRef: 'TXN-0001' }).success).toBe(
        true,
      );
    }
  });

  it('gives every amount refusal the stable code payment.amount_invalid (as #99 does)', () => {
    for (const amount of ['0.00', '-100.00', '12500', 'abc']) {
      const result = recordPaymentSchema.safeParse({ ...cashPayment, amount });
      const codes = result.error?.issues.map(
        (issue) => (issue as { params?: { code?: string } }).params?.code,
      );
      expect(codes).toContain('payment.amount_invalid');
    }
  });

  it('gives a missing transaction id the stable code payment.external_ref_required (as #99 does)', () => {
    const result = recordPaymentSchema.safeParse({ ...cashPayment, method: 'bank' });
    const issue = result.error?.issues[0] as { params?: { code?: string } } | undefined;
    expect(issue?.params?.code).toBe('payment.external_ref_required');
  });

  it('treats a blank note as no note, the same rule as the external id', () => {
    expect(recordPaymentSchema.parse({ ...cashPayment, note: '   ' }).note).toBeNull();
    expect(recordPaymentSchema.parse({ ...cashPayment, note: ' paid at the counter ' }).note).toBe(
      'paid at the counter',
    );
  });

  it('trims the external id, and treats a blank one as missing', () => {
    expect(
      recordPaymentSchema.parse({ ...cashPayment, method: 'bkash', externalRef: ' TXN-0001 ' }).externalRef,
    ).toBe('TXN-0001');
    expect(
      recordPaymentSchema.safeParse({ ...cashPayment, method: 'bkash', externalRef: '   ' }).success,
    ).toBe(false);
  });

  it('strips a branch, date or receipt number sent by the client: those come from the server', () => {
    const parsed = recordPaymentSchema.parse({
      ...cashPayment,
      branchId: invoiceId,
      paidOn: '2026-01-01',
      receiptNumber: 'R-1',
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'amount',
      'externalRef',
      'invoiceId',
      'method',
      'note',
      'partyId',
    ]);
  });
});

describe('salesPaymentSchema (a recorded payment, read back)', () => {
  const payment = {
    id: '0196f000-0000-7000-8000-000000000301',
    receiptNumber: 'R-000001',
    partyId,
    invoiceId,
    branchId: '0196f000-0000-7000-8000-0000000000b1',
    method: 'bkash',
    externalRef: 'TXN-0001',
    amount: '12500.00',
    status: 'posted',
    receivedAt: '2026-11-21T04:00:00.000Z',
    note: null,
  };

  it('accepts a posted payment and a voided one', () => {
    expect(salesPaymentSchema.safeParse(payment).success).toBe(true);
    expect(salesPaymentSchema.safeParse({ ...payment, status: 'voided' }).success).toBe(true);
    expect(salesPaymentSchema.safeParse({ ...payment, status: 'deleted' }).success).toBe(false);
  });

  it('pages payments with a cursor', () => {
    const page = { items: [payment], nextCursor: null };
    expect(salesPaymentListResponseSchema.safeParse(page).success).toBe(true);
  });
});

describe('customerDuesSchema (what the customer owes, with open invoices)', () => {
  const dues = {
    partyId,
    totalDue: '37500.00',
    advance: '0.00',
    openInvoices: [
      {
        invoiceId,
        invoiceNumber: 'INV-000001',
        invoiceDate: '2026-11-01',
        total: '50000.00',
        paid: '12500.00',
        due: '37500.00',
      },
    ],
  };

  it('accepts dues with open invoices, and a customer who owes nothing', () => {
    expect(customerDuesSchema.safeParse(dues).success).toBe(true);
    expect(customerDuesSchema.safeParse({ ...dues, totalDue: '0.00', openInvoices: [] }).success).toBe(true);
  });

  it('takes the invoice date as a Dhaka business date, not a timestamp', () => {
    const withDate = (invoiceDate: string) => ({
      ...dues,
      openInvoices: [{ ...dues.openInvoices[0], invoiceDate }],
    });
    expect(customerDuesSchema.safeParse(withDate('2026-11-01')).success).toBe(true);
    expect(customerDuesSchema.safeParse(withDate('2026-11-01T04:00:00.000Z')).success).toBe(false);
  });

  it('takes every amount as a money string', () => {
    expect(customerDuesSchema.safeParse({ ...dues, totalDue: 37500 }).success).toBe(false);
    const badInvoice = { ...dues.openInvoices[0], due: '37500' };
    expect(customerDuesSchema.safeParse({ ...dues, openInvoices: [badInvoice] }).success).toBe(false);
  });
});
