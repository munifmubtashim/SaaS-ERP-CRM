import {
  invoiceDetailSchema,
  invoiceListResponseSchema,
  invoiceSummarySchema,
  posCatalogSchema,
  postedInvoiceSchema,
  type PostInvoiceInput,
  type InvoiceDetail,
  type InvoiceSummary,
  type PaymentDraft,
  type PosItem,
  type SaleDraft,
} from '@erp/shared';
import type { IHttpClient } from './HttpClient';
import type { ISalesPaymentService } from './salesPaymentService';

/** The invoice a payment goes to: POST /v1/payments names the invoice and its customer (ADR 0057). */
export type PayableInvoice = Pick<InvoiceSummary, 'id' | 'partyId'>;

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
  /** The scope's invoices, newest first (the design's Invoices view; GET /v1/invoices, #221). */
  invoices(): Promise<InvoiceSummary[]>;
  /** One invoice by its id, with its lines and payments (GET /v1/invoices/:id, #221). */
  invoice(id: string): Promise<InvoiceDetail>;
  /**
   * Collect a payment on an invoice and answer the invoice as it is now. Moves money, so it carries an
   * Idempotency-Key (invariant 5): a retry with the same key answers the first payment and collects nothing again.
   * Never more than is due.
   */
  recordPayment(
    invoice: PayableInvoice,
    payment: PaymentDraft,
    idempotencyKey: string,
  ): Promise<InvoiceDetail>;
}

/** A payment as the counter enters it (shared, provisional; ADR 0016 lines 20 and 36). */
export type { PaymentDraft } from '@erp/shared';

/**
 * Sales module: the API.
 * - The POS is real (Munif, 25 Nov): posItems reads GET /v1/stock/pos-catalog (#199) and completeSale posts #185's
 *   postInvoiceSchema to POST /v1/invoices (#191), selling to the catalog's walk-in party until customers exist (F2).
 *   The client sends no price, cost or date; a serial number becomes its unit id from the catalog. The answer is read
 *   back from GET /v1/invoices/:id, so it is #221's summary with nothing invented.
 * - The invoice reads are #221's routes; the list reads the first page only, until the view pages.
 * - Collect pays through POST /v1/payments (ADR 0057, the same call as Record payment), then reads the invoice back.
 */
export class SalesService implements ISalesService {
  /** From the last catalog read: the walk-in party and each serial number's unit id. */
  private catalog: { walkInPartyId: string | null; unitIds: Map<string, string> } | null = null;

  constructor(
    protected readonly http: IHttpClient,
    private readonly payments: ISalesPaymentService,
  ) {}

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

  /**
   * POST /v1/invoices, then GET /v1/invoices/:id for #221's summary: the post answer has no branch or posting time.
   * If the read fails, a retry with the same Idempotency-Key gets the first sale back and sells nothing again.
   */
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
    return invoiceSummarySchema.parse(await this.invoice(posted.id));
  };

  invoices = async () => (await this.http.getJson('/v1/invoices', invoiceListResponseSchema)).items;
  invoice = (id: string) => this.http.getJson(`/v1/invoices/${encodeURIComponent(id)}`, invoiceDetailSchema);
  /**
   * POST /v1/payments on this invoice, then GET /v1/invoices/:id for what is still due. If the read fails, a retry with
   * the same Idempotency-Key answers the first payment and collects nothing again. A refusal is passed on as it is.
   */
  recordPayment = async (invoice: PayableInvoice, payment: PaymentDraft, idempotencyKey: string) => {
    await this.payments.recordPayment(
      {
        partyId: invoice.partyId,
        invoiceId: invoice.id,
        method: payment.method,
        amount: payment.amount,
        externalRef: payment.externalRef,
        note: null,
      },
      idempotencyKey,
    );
    return this.invoice(invoice.id);
  };
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
  invoice = (id: string) => this.pick('invoice').invoice(id);
  recordPayment = (invoice: PayableInvoice, payment: PaymentDraft, key: string) =>
    this.pick('recordPayment').recordPayment(invoice, payment, key);
}
