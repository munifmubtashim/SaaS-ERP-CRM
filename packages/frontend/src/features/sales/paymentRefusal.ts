import type { MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';

/**
 * Why the API refused a payment, when retrying can't help (ADR 0057 section 4): the person must change something. Null
 * for anything else (a network failure, a 5xx), where a retry with the same Idempotency-Key is safe. Shared by the two
 * payment screens, Record payment and POS › Invoices, so they name a refusal the same way.
 */
export function paymentRefusalOf(error: unknown): MessageKey | null {
  if (!(error instanceof ApiRequestError)) return null;
  const codes = (error.body?.fields ?? []).map((f) => f.code);
  if (codes.includes('payment.exceeds_due')) return 'payment.error.exceedsDue';
  if (codes.includes('payment.invoice_not_found')) return 'payment.error.invoiceGone';
  if (error.status === 403) return 'payment.error.forbidden';
  return null;
}
