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
  postedInvoiceSchema,
  postInvoiceSchema,
  salesSchema,
} from '../schemas/sales.schema.js';

/** Sales types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PosItem = z.infer<typeof posItemSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type SaleDraft = z.infer<typeof saleDraftSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;

/**
 * Sales module, types. Owner: Farhan.
 * TODO(Farhan): POS sessions, returns (roadmap 5.6).
 */
export type Sales = z.infer<typeof salesSchema>;
/** `POST /v1/invoices` (ADR 0022 section 2). */
export type PostInvoiceInput = z.infer<typeof postInvoiceSchema>;
export type PostedInvoice = z.infer<typeof postedInvoiceSchema>;
