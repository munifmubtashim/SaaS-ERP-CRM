import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../services';
import { paymentRefusalOf } from './paymentRefusal';

/** One mapping for both payment screens (RecordPaymentPage, POS › Invoices): ADR 0057 section 4. */
const refused = (status: number, codes: string[]) =>
  new ApiRequestError(status, {
    code:
      status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status >= 500
            ? 'SERVICE_UNAVAILABLE'
            : 'CONFLICT',
    message: 'refused',
    fields: codes.map((code) => ({ path: '', code, message: code })),
    requestId: 'req-1',
  });

describe('paymentRefusalOf', () => {
  it('names the refusals a retry cannot fix', () => {
    expect(paymentRefusalOf(refused(409, ['payment.exceeds_due']))).toBe('payment.error.exceedsDue');
    expect(paymentRefusalOf(refused(404, ['payment.invoice_not_found']))).toBe('payment.error.invoiceGone');
    expect(paymentRefusalOf(refused(403, []))).toBe('payment.error.forbidden');
  });

  it('is null for anything a retry with the same Idempotency-Key may fix', () => {
    expect(paymentRefusalOf(new Error('network down'))).toBeNull();
    expect(paymentRefusalOf(refused(503, []))).toBeNull();
    expect(paymentRefusalOf(refused(409, ['something.else']))).toBeNull();
  });
});
