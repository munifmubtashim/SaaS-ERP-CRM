import {
  customerDuesSchema,
  salesPaymentSchema,
  type CustomerDues,
  type RecordPaymentInput,
  type SalesPayment,
} from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the customer screens need from Sales. One small method per use (interface segregation). */
export interface ISalesService {
  /** What one customer owes, with their open invoices; 404 when the party is not in the active business. */
  dues(partyId: string): Promise<CustomerDues>;
  /**
   * Record a customer payment. The same `idempotencyKey` again returns the first payment, so a retry after a
   * lost reply never records it twice (ADR 0011). The server sets branch, receipt number and date.
   */
  recordPayment(input: RecordPaymentInput, idempotencyKey: string): Promise<SalesPayment>;
}

/**
 * Sales module: frontend API calls, one method per endpoint. Owner: Farhan.
 * TODO(Farhan): invoices, POS sessions, returns (roadmap 5.6).
 * createServices uses MockSalesService until the dues and payment routes exist (A15).
 */
export class SalesService implements ISalesService {
  constructor(protected readonly http: IHttpClient) {}

  /** GET /v1/parties/:id/dues. */
  dues(partyId: string): Promise<CustomerDues> {
    return this.http.getJson(`/v1/parties/${encodeURIComponent(partyId)}/dues`, customerDuesSchema);
  }

  /** POST /v1/payments with an Idempotency-Key header. */
  recordPayment(input: RecordPaymentInput, idempotencyKey: string): Promise<SalesPayment> {
    return this.http.postJson('/v1/payments', input, salesPaymentSchema, { idempotencyKey });
  }
}
