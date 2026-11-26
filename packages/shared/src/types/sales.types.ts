import type { z } from 'zod';
import type {
  paymentDraftSchema,
  paymentMethodSchema,
  invoiceStatusSchema,
  posItemSchema,
  cartLineSchema,
  saleDraftSchema,
  invoiceSummarySchema,
  invoiceDetailSchema,
  customerDuesSchema,
  openInvoiceSchema,
  paymentStatusSchema,
  postedInvoiceSchema,
  postInvoiceSchema,
  recordPaymentSchema,
  salesPaymentListResponseSchema,
  salesPaymentSchema,
  salesSchema,
} from '../schemas/sales.schema.js';

/** Sales types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
/** Sales types: z.infer of the shared schemas. Owner: Farhan. */
export type Sales = z.infer<typeof salesSchema>;

/** Provisional view shapes for the POS screen (see the schema file). */
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PosItem = z.infer<typeof posItemSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type SaleDraft = z.infer<typeof saleDraftSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;

/**
 * Sales module, types inferred from the Zod schemas. Owner: Farhan.
 * TODO(Farhan): POS sessions, returns (roadmap 5.6).
 */
export type Sales = z.infer<typeof salesSchema>;
/** `POST /v1/invoices` (ADR 0022 section 2). */
export type PostInvoiceInput = z.infer<typeof postInvoiceSchema>;
export type PostedInvoice = z.infer<typeof postedInvoiceSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
/** `POST /v1/payments` (ADR 0057): what the payment form sends (before trimming). */
/** Customer payments and dues (#47): POST /v1/payments and the dues read (ADR 0057). */
/** What the payment form sends (before trimming). */
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
/** What the server works with after parsing. */
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type SalesPayment = z.infer<typeof salesPaymentSchema>;
export type SalesPaymentListResponse = z.infer<typeof salesPaymentListResponseSchema>;
export type OpenInvoice = z.infer<typeof openInvoiceSchema>;
export type CustomerDues = z.infer<typeof customerDuesSchema>;
