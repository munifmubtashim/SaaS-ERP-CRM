/** One invoice as the list shows it (ADR 0059 section 2). Money as strings; no cost. */
export interface InvoiceSummaryRecord {
  id: string;
  number: string;
  branchId: string;
  partyId: string;
  /** The business date in Asia/Dhaka, YYYY-MM-DD. */
  invoiceDate: string;
  issuedAt: Date;
  /** The name on the invoice, or the party's name when the counter left it blank. */
  customerName: string;
  total: string;
  /** Its posted payments, at the sale and after. */
  paid: string;
  due: string;
  status: 'posted' | 'voided';
}

/** One invoice with its lines and payments. */
export interface InvoiceDetailRecord extends InvoiceSummaryRecord {
  soldBy: string;
  subtotal: string;
  discount: string;
  lines: { description: string; quantity: string; unitPrice: string; amount: string }[];
  payments: {
    receivedAt: Date;
    receiptNumber: string;
    method: 'cash' | 'bank' | 'bkash' | 'card';
    amount: string;
    externalRef: string | null;
  }[];
}

export interface InvoiceListFilter {
  partyId?: string;
  branchId?: string;
  /** The page starts after this invoice id (ids are uuid v7, so newest first is id descending). */
  beforeId?: string;
  limit: number;
}

/**
 * What SalesManager's invoice reads need (ADR 0059 section 2). The consuming layer owns the contract (ADR 0004); dal's
 * SalesQuery satisfies it. Runs in the request's tenant transaction under RLS, so another business's invoice is never
 * seen.
 */
export interface IInvoiceReadQuery {
  /** The scope's invoices, newest first. */
  listInvoices(filter: InvoiceListFilter): Promise<InvoiceSummaryRecord[]>;
  findInvoice(id: string): Promise<InvoiceDetailRecord | null>;
}
