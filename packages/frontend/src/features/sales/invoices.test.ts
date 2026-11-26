import type { InvoicePaymentStatus, InvoiceSummary } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { canCollect, filterInvoices, paymentProblem } from './invoices';

/** The design's Invoices view (Sales.dc.html): the status filter and the checks before a payment is saved. */
const invoice = (
  number: string,
  paymentStatus: InvoicePaymentStatus,
  issuedAt: string,
  status: InvoiceSummary['status'] = 'posted',
): InvoiceSummary => {
  const paid = paymentStatus === 'paid' ? '1000.00' : paymentStatus === 'partly_paid' ? '400.00' : '0.00';
  return {
    id: `0195f000-0000-7000-8000-${number.slice(2).padStart(12, '0')}`,
    number,
    branchId: '0195f000-0000-7000-8000-00000000b001',
    partyId: '0195f000-0000-7000-8000-00000000a001',
    invoiceDate: issuedAt.slice(0, 10),
    issuedAt,
    customerName: 'Sample Customer',
    total: '1000.00',
    paid,
    due: paymentStatus === 'paid' ? '0.00' : paymentStatus === 'partly_paid' ? '600.00' : '1000.00',
    status,
    paymentStatus,
  };
};

const LIST = [
  invoice('C-000101', 'paid', '2026-11-10T05:00:00.000Z'),
  invoice('C-000103', 'due', '2026-11-12T05:00:00.000Z'),
  invoice('C-000102', 'partly_paid', '2026-11-11T05:00:00.000Z'),
  invoice('C-000104', 'due', '2026-11-12T06:00:00.000Z', 'voided'),
];

describe('filterInvoices', () => {
  it('All shows every invoice, voided ones too, newest first', () => {
    expect(filterInvoices(LIST, 'all').map((i) => i.number)).toEqual([
      'C-000104',
      'C-000103',
      'C-000102',
      'C-000101',
    ]);
  });

  it('a payment status shows only posted invoices with that status (#221 paymentStatus)', () => {
    expect(filterInvoices(LIST, 'partly_paid').map((i) => i.number)).toEqual(['C-000102']);
    expect(filterInvoices(LIST, 'paid').map((i) => i.number)).toEqual(['C-000101']);
    // A voided invoice owes nothing, whatever its paymentStatus says: it never shows under Due.
    expect(filterInvoices(LIST, 'due').map((i) => i.number)).toEqual(['C-000103']);
  });
});

describe('filterInvoices order (the business date first)', () => {
  it('sorts by invoiceDate, newest first, then by posting time: a back-dated invoice sits on its own day', () => {
    const backDated = {
      ...invoice('C-000105', 'due', '2026-11-12T09:00:00.000Z'),
      invoiceDate: '2026-11-09',
    };
    expect(filterInvoices([...LIST, backDated], 'all').map((i) => i.number)).toEqual([
      'C-000104',
      'C-000103',
      'C-000102',
      'C-000101',
      'C-000105',
    ]);
  });
});

describe('canCollect', () => {
  it('a posted invoice with something still due can take a payment; a paid or voided one cannot', () => {
    const [paid, due, partly, voided] = LIST;
    expect([paid, due, partly, voided].map((i) => i && canCollect(i))).toEqual([false, true, true, false]);
  });
});

describe('paymentProblem', () => {
  it('accepts an amount above zero up to what is due, as typed taka', () => {
    expect(paymentProblem('600', '600.00')).toBeNull();
    expect(paymentProblem('1,250.5', '5000.00')).toBeNull();
  });

  it('refuses nothing, zero, or text that is not an amount', () => {
    expect(paymentProblem('', '600.00')).toBe('not_positive');
    expect(paymentProblem('0', '600.00')).toBe('not_positive');
    expect(paymentProblem('12abc', '600.00')).toBe('not_an_amount');
  });

  it('refuses more than is still due (the design: "That is more than the ৳600 still due")', () => {
    expect(paymentProblem('600.01', '600.00')).toBe('over_balance');
  });
});
