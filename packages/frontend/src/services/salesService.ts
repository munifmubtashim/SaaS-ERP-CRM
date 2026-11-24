import {
  compareMoney,
  invoiceDetailSchema,
  invoiceSummarySchema,
  isZero,
  parseMoney,
  posCatalogSchema,
  postedInvoiceSchema,
  type PostInvoiceInput,
  type InvoiceDetail,
  type InvoiceSummary,
  type PaymentDraft,
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
  /** The active branch's invoices (the design's Invoices view). */
  invoices(): Promise<InvoiceSummary[]>;
  /** One invoice with its lines, payments and balance. */
  invoice(number: string): Promise<InvoiceDetail>;
  /**
   * Collect a payment on an invoice. Moves money, so it carries an Idempotency-Key (invariant 5): a retry with the
   * same key answers the first result and collects nothing again. Never more than the balance.
   */
  recordPayment(number: string, payment: PaymentDraft, idempotencyKey: string): Promise<InvoiceDetail>;
}

/** A payment as the counter enters it (shared, provisional; ADR 0016 lines 20 and 36). */
export type { PaymentDraft } from '@erp/shared';

/**
 * Sales module: the API.
 * - The POS is real (Munif, 25 Nov): posItems reads GET /v1/stock/pos-catalog (#199) and completeSale posts #185's
 *   postInvoiceSchema to POST /v1/invoices (#191), selling to the catalog's walk-in party until customers exist (F2).
 *   The client sends no price, cost or date; a serial number becomes its unit id from the catalog.
 * - The invoices view's paths are still provisional (no routes yet), so it stays on sample data (sales.invoices).
 */
export class SalesService implements ISalesService {
  /** From the last catalog read: the walk-in party and each serial number's unit id. */
  private catalog: { walkInPartyId: string | null; unitIds: Map<string, string> } | null = null;

  constructor(protected readonly http: IHttpClient) {}

  posItems = async (): Promise<PosItem[]> => {
    const answer = await this.http.getJson('/v1/stock/pos-catalog', posCatalogSchema);
    this.catalog = {
      walkInPartyId: answer.walkInPartyId,
      unitIds: new Map(answer.items.flatMap((item) => item.units.map((u) => [u.serialNo, u.id] as const))),
    };
    return answer.items.map((item) => ({
      id: item.productId,
      name: item.name,
      category: item.category,
      kind: item.tracking,
      price: item.sellPrice,
      available: item.onHand,
      serialNumbers: item.units.map((u) => u.serialNo),
    }));
  };

  completeSale = async (draft: SaleDraft, idempotencyKey: string): Promise<InvoiceSummary> => {
    const catalog = this.catalog;
    if (!catalog?.walkInPartyId)
      throw new Error('The POS catalog (with the walk-in party) is not loaded yet.');
    const body: PostInvoiceInput = {
      partyId: catalog.walkInPartyId,
      customerName: draft.customerName,
      lines: draft.lines.map((line) => ({
        productId: line.itemId,
        serialUnitId: line.serialNumber ? (catalog.unitIds.get(line.serialNumber) ?? null) : null,
        qty: line.quantity,
      })),
      discount: draft.discount,
      payments: draft.payment ? [draft.payment] : [],
    };
    const posted = await this.http.postJson('/v1/invoices', body, postedInvoiceSchema, { idempotencyKey });
    const paid = parseMoney(posted.paid);
    return {
      number: posted.number,
      issuedAt: new Date().toISOString(),
      customerName: posted.customerName ?? '—',
      total: posted.total,
      paid: posted.paid,
      status: isZero(parseMoney(posted.due))
        ? 'paid'
        : compareMoney(paid, parseMoney('0.00')) > 0
          ? 'partly_paid'
          : 'due',
    };
  };

  invoices = () => this.http.getJson('/v1/invoices', z.array(invoiceSummarySchema));
  invoice = (number: string) =>
    this.http.getJson(`/v1/invoices/${encodeURIComponent(number)}`, invoiceDetailSchema);
  recordPayment = (number: string, payment: PaymentDraft, idempotencyKey: string) =>
    this.http.postJson(`/v1/invoices/${encodeURIComponent(number)}/payments`, payment, invoiceDetailSchema, {
      idempotencyKey,
    });
}

export type SalesCall = keyof ISalesService;

/** Sends each call to the sample or the real service, by its own key. Built only in createServices. */
export class SalesServiceSwitch implements ISalesService {
  constructor(
    private readonly real: ISalesService,
    private readonly sample: ISalesService,
    private readonly useSample: (call: SalesCall) => boolean,
  ) {}
  private pick(call: SalesCall): ISalesService {
    return this.useSample(call) ? this.sample : this.real;
  }
  posItems = () => this.pick('posItems').posItems();
  completeSale = (draft: SaleDraft, key: string) => this.pick('completeSale').completeSale(draft, key);
  invoices = () => this.pick('invoices').invoices();
  invoice = (number: string) => this.pick('invoice').invoice(number);
  recordPayment = (number: string, payment: PaymentDraft, key: string) =>
    this.pick('recordPayment').recordPayment(number, payment, key);
}
