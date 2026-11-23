import {
  invoiceSummarySchema,
  posItemSchema,
  type InvoiceSummary,
  type PosItem,
  type SaleDraft,
} from '@erp/shared';
import { z } from 'zod';
import type { IHttpClient } from './HttpClient';

/**
 * What the POS screen needs from Sales (design/owner-dashboard/Sales.dc.html, selling half). Owner: Farhan.
 * Provisional, like the shapes it uses (#134): how a sale posts is ADR 0022's.
 */
export interface ISalesService {
  /** The items the counter can sell at the active branch, with stock and, for serial items, their units. */
  posItems(): Promise<PosItem[]>;
  /**
   * Complete sale. Moves money and stock, so it carries an Idempotency-Key (invariant 5, ADR 0011): a retry with the
   * same key answers the first invoice and sells nothing again.
   */
  completeSale(draft: SaleDraft, idempotencyKey: string): Promise<InvoiceSummary>;
}

/** Sales module: the API. The paths are provisional; neither route exists yet (ADR 0022). */
export class SalesService implements ISalesService {
  constructor(protected readonly http: IHttpClient) {}
  posItems = () => this.http.getJson('/v1/pos/items', z.array(posItemSchema));
  completeSale = (draft: SaleDraft, idempotencyKey: string) =>
    this.http.postJson('/v1/sales', draft, invoiceSummarySchema, { idempotencyKey });
}
