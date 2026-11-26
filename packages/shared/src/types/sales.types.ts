import type { z } from 'zod';
import type {
  cartLineSchema,
  customerDuesSchema,
  invoiceDetailSchema,
  invoiceListQuerySchema,
  invoiceListResponseSchema,
  invoicePaymentStatusSchema,
  invoiceStatusSchema,
  invoiceSummarySchema,
  openInvoiceSchema,
  paymentDraftSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  posItemSchema,
  postInvoiceSchema,
  postedInvoiceSchema,
  recordPaymentSchema,
  saleDraftSchema,
  salesPaymentListResponseSchema,
  salesPaymentSchema,
  salesSchema,
} from '../schemas/sales.schema.js';

/**
 * Sales module, types inferred from the Zod schemas. Owner: Farhan.
 * TODO(Farhan): POS sessions, returns (roadmap 5.6).
 */
export type Sales = z.infer<typeof salesSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
/** `POST /v1/invoices` (ADR 0022 section 2). */
export type PostInvoiceInput = z.infer<typeof postInvoiceSchema>;
export type PostedInvoice = z.infer<typeof postedInvoiceSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
/** `POST /v1/payments` (ADR 0057): what the payment form sends (before trimming). */
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
/** What the server works with after parsing. */
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type SalesPayment = z.infer<typeof salesPaymentSchema>;
export type SalesPaymentListResponse = z.infer<typeof salesPaymentListResponseSchema>;
export type OpenInvoice = z.infer<typeof openInvoiceSchema>;
export type CustomerDues = z.infer<typeof customerDuesSchema>;
/** F4, the invoice reads (ADR 0059 section 2). */
export type InvoicePaymentStatus = z.infer<typeof invoicePaymentStatusSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;

/** Provisional POS view shapes (UI stack; local integration only). */
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PosItem = z.infer<typeof posItemSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type SaleDraft = z.infer<typeof saleDraftSchema>;
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;
