import { z } from 'zod';
import { moneySchema } from '../utils/money.js';
import { quantityTextSchema } from './inventory.schema.js';

/**
 * Sales module, Zod schemas shared by backend and frontend. Owner: Farhan.
 *
 * PROVISIONAL VIEW SHAPES for the Sales / POS screen (design/owner-dashboard/Sales.dc.html): what the screen shows and
 * sends. They don't decide how a sale posts (ADR 0022): no journal, stock movement or cost here. Replace them when
 * ADR 0022's sale API is agreed.
 */

/** The plan's payment methods, all entered by hand (ADR 0016 lines 18 and 64). The demo POS offers cash and bKash. */
export const paymentMethodSchema = z.enum(['cash', 'bank', 'bkash', 'card']);

/**
 * A payment as the counter enters it: amount above zero, the method, and the external transaction id, which Bank,
 * bKash and Card need and Cash doesn't (ADR 0016 lines 20, 36 and 104).
 */
export const paymentDraftSchema = z
  .object({
    method: paymentMethodSchema,
    amount: moneySchema.refine(
      (value) => !value.startsWith('-') && !/^0+\.00$/.test(value),
      'More than zero',
    ),
    externalRef: z.string().trim().min(1).max(64).nullable(),
  })
  .refine((payment) => payment.method === 'cash' || payment.externalRef !== null, {
    message: 'Bank, bKash and card payments need the transaction id.',
    path: ['externalRef'],
  });
export const invoiceStatusSchema = z.enum(['paid', 'partly_paid', 'due']);

/** An item the counter can sell. Serial-tracked items list their available serial numbers. */
export const posItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  kind: z.enum(['serial', 'quantity']),
  price: moneySchema,
  available: quantityTextSchema,
  serialNumbers: z.array(z.string().min(1)),
});

export const cartLineSchema = z.object({
  itemId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: moneySchema,
  quantity: quantityTextSchema,
  /** The unit sold, for a serial-tracked item; null for counted items. */
  serialNumber: z.string().min(1).nullable(),
});

/** What Complete sale sends: the lines, a discount, and the payment received now (null: all due). */
export const saleDraftSchema = z.object({
  customerName: z.string().trim().min(1).max(200).nullable(),
  lines: z.array(cartLineSchema).min(1),
  discount: moneySchema,
  payment: paymentDraftSchema.nullable(),
});

export const invoiceSummarySchema = z.object({
  number: z.string().min(1),
  issuedAt: z.iso.datetime(),
  customerName: z.string().min(1),
  total: moneySchema,
  paid: moneySchema,
  status: invoiceStatusSchema,
});

export const invoiceDetailSchema = invoiceSummarySchema.extend({
  soldBy: z.string().min(1),
  lines: z.array(
    z.object({
      description: z.string().min(1),
      quantity: quantityTextSchema,
      unitPrice: moneySchema,
      amount: moneySchema,
    }),
  ),
  discount: moneySchema,
  payments: z.array(
    z.object({
      receivedAt: z.iso.datetime(),
      method: paymentMethodSchema,
      amount: moneySchema,
      externalRef: z.string().min(1).nullable(),
    }),
  ),
  balance: moneySchema,
});
