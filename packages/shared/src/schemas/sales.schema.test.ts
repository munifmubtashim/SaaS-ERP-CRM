import { describe, expect, it } from 'vitest';
import { invoiceDetailSchema, invoiceSummarySchema, posItemSchema, saleDraftSchema } from './sales.schema.js';

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
      payment: { method: 'cash', amount: '245000.00' },
    };
    expect(saleDraftSchema.parse(draft)).toEqual(draft);
    expect(saleDraftSchema.safeParse({ ...draft, lines: [] }).success).toBe(false);
    expect(
      saleDraftSchema.safeParse({ ...draft, payment: { method: 'cheque', amount: '1.00' } }).success,
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
      payments: [{ receivedAt: '2026-11-13T06:42:00.000Z', method: 'card', amount: '100000.00' }],
      balance: '154000.00',
    };
    expect(invoiceDetailSchema.parse(detail)).toEqual(detail);
  });
});
