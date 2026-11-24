import type { z } from 'zod';
import type {
  paymentMethodSchema,
  postedInvoiceSchema,
  postInvoiceSchema,
  salesSchema,
} from '../schemas/sales.schema.js';

/**
 * Sales module, types. Owner: Farhan.
 * TODO(Farhan): POS sessions, returns (roadmap 5.6).
 */
export type Sales = z.infer<typeof salesSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
/** `POST /v1/invoices` (ADR 0022 section 2). */
export type PostInvoiceInput = z.infer<typeof postInvoiceSchema>;
export type PostedInvoice = z.infer<typeof postedInvoiceSchema>;
