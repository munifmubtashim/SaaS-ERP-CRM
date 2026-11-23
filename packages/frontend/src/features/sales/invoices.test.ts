import type { InvoiceSummary } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { filterInvoices, paymentProblem } from './invoices';

/** The design's Invoices view (Sales.dc.html): the status filter and the checks before a payment is saved. */
const invoice = (number: string, status: InvoiceSummary['status'], issuedAt: string): InvoiceSummary => ({
  number,
  issuedAt,
  customerName: 'Sample Customer',
  total: '1000.00',
  paid: status === 'paid' ? '1000.00' : status === 'partly_paid' ? '400.00' : '0.00',
  status,
});

const LIST = [
  invoice('C-000101', 'paid', '2026-11-10T05:00:00.000Z'),
  invoice('C-000103', 'due', '2026-11-12T05:00:00.000Z'),
  invoice('C-000102', 'partly_paid', '2026-11-11T05:00:00.000Z'),
];

describe('filterInvoices', () => {
  it('All shows every invoice, newest first', () => {
    expect(filterInvoices(LIST, 'all').map((i) => i.number)).toEqual(['C-000103', 'C-000102', 'C-000101']);
  });

  it('a status shows only that status', () => {
    expect(filterInvoices(LIST, 'partly_paid').map((i) => i.number)).toEqual(['C-000102']);
    expect(filterInvoices(LIST, 'paid').map((i) => i.number)).toEqual(['C-000101']);
  });
});

describe('paymentProblem', () => {
  it('accepts an amount above zero up to the balance, as typed taka', () => {
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
