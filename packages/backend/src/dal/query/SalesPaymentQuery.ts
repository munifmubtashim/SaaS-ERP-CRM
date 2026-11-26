import { BaseQuery } from './BaseQuery.js';

export interface SalesPaymentInsert {
  id: string;
  branchId: string;
  partyId: string;
  invoiceId: string | null;
  method: string;
  amount: string;
  externalRef: string | null;
  receiptNumber: string;
  journalId: string;
  receivedAt: Date;
  note: string | null;
  createdBy: string | null;
}

/**
 * Sales payments' database access (ADR 0026 section 1, ADR 0016 section 1). Satisfies businessLogic's
 * contracts/ISalesPaymentQuery for SalesPaymentRecorder: at the sale (item 3b) and, later, POST /v1/payments
 * (Farhan, F3). Runs in the request's tenant transaction under RLS.
 */
export class SalesPaymentQuery extends BaseQuery {
  async newPaymentId(): Promise<string> {
    const [row] = await this.db.$queryRaw<{ id: string }[]>`SELECT uuid_v7()::text AS id`;
    if (!row) throw new Error('uuid_v7() returned nothing');
    return row.id;
  }

  /**
   * The invoice's open due (total less its posted payments), with the invoice row locked FOR UPDATE until the request
   * commits, so two payments can't both fit under one due. Null if the invoice isn't this party's or isn't visible.
   */
  async invoiceDueForUpdate(invoiceId: string, partyId: string): Promise<string | null> {
    const [invoice] = await this.db.$queryRaw<{ total: string }[]>`
      SELECT total::text FROM invoice
       WHERE id = ${invoiceId}::uuid AND party_id = ${partyId}::uuid AND status = 'posted' FOR UPDATE`;
    if (!invoice) return null;
    const [due] = await this.db.$queryRaw<{ due: string }[]>`
      SELECT (${invoice.total}::numeric(18,2) - coalesce(sum(amount), 0))::numeric(18,2)::text AS due
        FROM sales_payment WHERE invoice_id = ${invoiceId}::uuid AND status = 'posted'`;
    return due?.due ?? invoice.total;
  }

  async insertPayment(payment: SalesPaymentInsert): Promise<void> {
    await this.requireOneBusiness('A payment');
    await this.db.$executeRaw`
      INSERT INTO sales_payment (id, business_id, branch_id, receipt_number, party_id, invoice_id, method, external_ref,
                                 amount, journal_id, received_at, note, created_by)
      VALUES (${payment.id}::uuid, (SELECT app_business_ids())[1], ${payment.branchId}::uuid, ${payment.receiptNumber},
              ${payment.partyId}::uuid, ${payment.invoiceId}::uuid, ${payment.method}, ${payment.externalRef},
              ${payment.amount}::numeric(18,2), ${payment.journalId}::uuid, ${payment.receivedAt}::timestamptz,
              ${payment.note}, ${payment.createdBy}::uuid)`;
  }
}
