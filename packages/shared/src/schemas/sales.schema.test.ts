import { describe, expect, it } from 'vitest';
import {
  customerDuesSchema,
  paymentMethodSchema,
  recordPaymentSchema,
  salesPaymentListResponseSchema,
  salesPaymentSchema,
} from './sales.schema.js';

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
