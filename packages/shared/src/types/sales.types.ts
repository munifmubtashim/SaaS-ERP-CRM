import type { z } from 'zod';
import type {
  customerDuesSchema,
  openInvoiceSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  recordPaymentSchema,
  salesPaymentListResponseSchema,
  salesPaymentSchema,
  salesSchema,
} from '../schemas/sales.schema.js';

/**
 * Sales module, types inferred from the Zod schemas. Owner: Farhan.
 * TODO(Farhan): invoices, POS sessions, returns (roadmap 5.6).
 */
export type Sales = z.infer<typeof salesSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
/** What the payment form sends (before trimming). */
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
/** What the server works with after parsing. */
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type SalesPayment = z.infer<typeof salesPaymentSchema>;
export type SalesPaymentListResponse = z.infer<typeof salesPaymentListResponseSchema>;
export type OpenInvoice = z.infer<typeof openInvoiceSchema>;
export type CustomerDues = z.infer<typeof customerDuesSchema>;
