import { describe, expect, it } from 'vitest';
import {
  invoiceDetailSchema,
  invoiceSummarySchema,
  paymentDraftSchema,
  paymentMethodSchema,
  posItemSchema,
  saleDraftSchema,
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
