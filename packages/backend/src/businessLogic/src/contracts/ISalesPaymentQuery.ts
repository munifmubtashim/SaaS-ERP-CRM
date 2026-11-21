/** A sales payment row as A15's table will hold it (ADR 0016 section 4); journal_id is NOT NULL there. */
export interface NewSalesPayment {
  id: string;
  branchId: string;
  partyId: string;
  /** Null for an advance. */
  invoiceId: string | null;
  method: string;
  amount: string;
  externalRef: string | null;
  receiptNumber: string;
  journalId: string;
}

/** What SalesPaymentRecorder needs from dal. A15 (ADR 0026, #64, Farhan) builds the table and the Query. */
export interface ISalesPaymentQuery {
  /** A fresh uuid_v7() from the database, so the journal can name its source before the row exists. */
  newPaymentId(): Promise<string>;
  /**
   * The invoice's open due as a two-decimal string, with the invoice row locked (SELECT ... FOR UPDATE) until the
   * request commits, so two payments can't both fit under the same due. Null when the invoice doesn't exist in
   * the caller's scope or isn't this party's.
   */
  invoiceDueForUpdate(invoiceId: string, partyId: string): Promise<string | null>;
  insertPayment(payment: NewSalesPayment): Promise<void>;
}
