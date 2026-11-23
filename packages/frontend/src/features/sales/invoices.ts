import { compareMoney, parseMoney, ZERO, type InvoiceSummary } from '@erp/shared';
import { takaInput } from './cart';

export type InvoiceFilter = 'all' | InvoiceSummary['status'];

/** The design's status filter (All, Paid, Partly paid, Due), newest invoice first. */
export function filterInvoices(list: readonly InvoiceSummary[], filter: InvoiceFilter): InvoiceSummary[] {
  return list
    .filter((invoice) => filter === 'all' || invoice.status === filter)
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
}

/**
 * Why a payment can't be saved yet: nothing or zero entered, text that isn't an amount, or more than is still due.
 * Typed taka is read by text rules only (takaInput), never as a float.
 */
export function paymentProblem(
  typed: string,
  balance: string,
): 'not_positive' | 'not_an_amount' | 'over_balance' | null {
  const amount = takaInput(typed);
  if (amount === null) return 'not_an_amount';
  if (compareMoney(parseMoney(amount), ZERO) <= 0) return 'not_positive';
  if (compareMoney(parseMoney(amount), parseMoney(balance)) > 0) return 'over_balance';
  return null;
}
