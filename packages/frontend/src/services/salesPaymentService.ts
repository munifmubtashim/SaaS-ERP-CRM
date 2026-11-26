import { salesPaymentSchema, type RecordPaymentInput, type SalesPayment } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/**
 * Customer payments (ADR 0057, frontend-wiring.md "Customer payments"). Owner: Farhan. Its own service and demo key
 * (`sales.payments`), so the payment screens can switch to the API when invoice reads exist, apart from the POS.
 */
export interface ISalesPaymentService {
  /**
   * POST /v1/payments: a payment on one of the customer's invoices, or an advance (no invoice). Moves money, so it
   * carries an Idempotency-Key (invariant 5): a retry with the same key answers the first payment and records nothing
   * again. The server sets the branch, the receipt number and the date.
   */
  recordPayment(payment: RecordPaymentInput, idempotencyKey: string): Promise<SalesPayment>;
}

/** The API. */
export class SalesPaymentService implements ISalesPaymentService {
  constructor(protected readonly http: IHttpClient) {}
  recordPayment = (payment: RecordPaymentInput, idempotencyKey: string) =>
    this.http.postJson('/v1/payments', payment, salesPaymentSchema, { idempotencyKey });
}
