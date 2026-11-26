import { compareMoney, parseMoney, ZERO, type InvoicePaymentStatus, type InvoiceSummary } from '@erp/shared';
import { takaInput } from './cart';

export type InvoiceFilter = 'all' | InvoicePaymentStatus;

/**
 * The design's status filter (All, Paid, Partly paid, Due), newest invoice first. The filter reads #221's
 * `paymentStatus`; a voided invoice shows under All only, since it owes nothing.
 */
export function filterInvoices(list: readonly InvoiceSummary[], filter: InvoiceFilter): InvoiceSummary[] {
  return list
    .filter(
      (invoice) => filter === 'all' || (invoice.status === 'posted' && invoice.paymentStatus === filter),
    )
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
}

/** A payment can be collected on a posted invoice with something still due, never on a voided one. */
export function canCollect(invoice: InvoiceSummary): boolean {
  return invoice.status === 'posted' && invoice.paymentStatus !== 'paid';
}

/**
 * Why a payment can't be saved yet: nothing or zero entered, text that isn't an amount, or more than is still due.
 * Typed taka is read by text rules only (takaInput), never as a float.
 */
export function paymentProblem(
  typed: string,
  due: string,
): 'not_positive' | 'not_an_amount' | 'over_balance' | null {
  const amount = takaInput(typed);
  if (amount === null) return 'not_an_amount';
  if (compareMoney(parseMoney(amount), ZERO) <= 0) return 'not_positive';
  if (compareMoney(parseMoney(amount), parseMoney(due)) > 0) return 'over_balance';
  return null;
}
