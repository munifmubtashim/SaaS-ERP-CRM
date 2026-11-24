import type { z } from 'zod';
import type {
  cartLineSchema,
  customerDuesSchema,
  invoiceDetailSchema,
  invoiceStatusSchema,
  invoiceSummarySchema,
  openInvoiceSchema,
  paymentDraftSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  posItemSchema,
  recordPaymentSchema,
  saleDraftSchema,
  salesPaymentListResponseSchema,
  salesPaymentSchema,
  salesSchema,
} from '../schemas/sales.schema.js';

/** Sales types: z.infer of the shared schemas. Owner: Farhan. */
export type Sales = z.infer<typeof salesSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Provisional view shapes for the POS screen (see the schema file). */
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PosItem = z.infer<typeof posItemSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type SaleDraft = z.infer<typeof saleDraftSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;

/** Customer payments and dues (#47): POST /v1/payments and the dues read (ADR 0057). */
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
/** What the payment form sends (before trimming). */
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
/** What the server works with after parsing. */
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type SalesPayment = z.infer<typeof salesPaymentSchema>;
export type SalesPaymentListResponse = z.infer<typeof salesPaymentListResponseSchema>;
export type OpenInvoice = z.infer<typeof openInvoiceSchema>;
export type CustomerDues = z.infer<typeof customerDuesSchema>;
