import type { PostedInvoice, PostInvoiceInput, RecordPayment, SalesPayment } from '@erp/shared';

/** What SalesController needs. Owned by api; businessLogic's SalesManager satisfies it. */
export interface ISalesManager {
  /** ADR 0022 section 2: posts a sale and its payments in the request's transaction. */
  postInvoice(input: PostInvoiceInput, where: { branchId: string; userId: string }): Promise<PostedInvoice>;
  /** ADR 0057: records a customer payment, or an advance, with its journal and receipt. */
  recordPayment(input: RecordPayment, where: { branchId: string; userId: string }): Promise<SalesPayment>;
}
