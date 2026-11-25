/** One posted invoice of a customer with something still to pay (ADR 0059 section 1). Money as strings. */
export interface OpenInvoiceRecord {
  invoiceId: string;
  invoiceNumber: string;
  /** The invoice's business date in Asia/Dhaka, YYYY-MM-DD. */
  invoiceDate: string;
  total: string;
  /** Its posted payments, at the sale and after. */
  paid: string;
  due: string;
}

/**
 * What PartyManager.dues needs from the sales documents (ADR 0059 section 1). The consuming layer owns the contract
 * (ADR 0004); dal's SalesPaymentQuery satisfies it. Runs in the request's tenant transaction under RLS.
 */
export interface IOpenInvoiceQuery {
  /** The party's posted invoices whose total is above their posted payments, oldest first. */
  openInvoices(partyId: string): Promise<OpenInvoiceRecord[]>;
}
