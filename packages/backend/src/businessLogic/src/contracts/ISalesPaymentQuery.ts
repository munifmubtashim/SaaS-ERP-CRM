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
   * True when the party exists in the caller's business (read under RLS). An advance has no invoice to vouch for
   * its party, so the recorder asks this before taking a receipt number (Farhan, #99). A15's composite foreign key
   * (ADR 0026) backs it up in the database.
   */
  partyInScope(partyId: string): Promise<boolean>;
  /**
   * The invoice's open due as a two-decimal string, with the invoice row locked (SELECT ... FOR UPDATE) until the
   * request commits, so two payments can't both fit under the same due. **Only a posted invoice that isn't voided
   * has a due.** Null when the invoice doesn't exist in the caller's scope, isn't this party's, is still a draft
   * or is voided (Farhan, #99), so the payment is refused with 404.
   */
  invoiceDueForUpdate(invoiceId: string, partyId: string): Promise<string | null>;
  insertPayment(payment: NewSalesPayment): Promise<void>;
}
