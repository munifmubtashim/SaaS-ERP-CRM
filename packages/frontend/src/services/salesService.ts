import { customerDuesSchema, type CustomerDues } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the customer screens need from Sales. One small method per use (interface segregation). */
export interface ISalesService {
  /** What one customer owes, with their open invoices; 404 when the party is not in the active business. */
  dues(partyId: string): Promise<CustomerDues>;
}

/**
 * Sales module: frontend API calls, one method per endpoint. Owner: Farhan.
 * TODO(Farhan): invoices, POS sessions, returns (roadmap 5.6).
 * createServices uses MockSalesService until the dues route exists (A15).
 */
export class SalesService implements ISalesService {
  constructor(protected readonly http: IHttpClient) {}

  /** GET /v1/parties/:id/dues. */
  dues(partyId: string): Promise<CustomerDues> {
    return this.http.getJson(`/v1/parties/${encodeURIComponent(partyId)}/dues`, customerDuesSchema);
  }
}
