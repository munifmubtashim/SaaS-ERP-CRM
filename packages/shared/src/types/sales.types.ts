import type { z } from 'zod';
import type {
  paymentMethodSchema,
  invoiceStatusSchema,
  posItemSchema,
  cartLineSchema,
  saleDraftSchema,
  invoiceSummarySchema,
  invoiceDetailSchema,
} from '../schemas/sales.schema.js';

/** Sales types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PosItem = z.infer<typeof posItemSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type SaleDraft = z.infer<typeof saleDraftSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
