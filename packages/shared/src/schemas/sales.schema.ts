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
  /** The product's category; null when it has none (GET /v1/stock/pos-catalog). */
  category: z.string().min(1).nullable(),
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
      /** The system receipt number every payment gets (ADR 0016 line 19; ADR 0015 numbers it per branch). */
      receiptNumber: z.string().min(1),
      method: paymentMethodSchema,
      amount: moneySchema,
      externalRef: z.string().min(1).nullable(),
    }),
  ),
  balance: moneySchema,
});
import { MONEY_PATTERN, ZERO, moneySchema, parseMoney } from '../utils/money.js';
import { cursorPageSchema } from '../utils/pagination.js';

/**
 * Sales module, Zod schemas shared by backend and frontend. Owner: Farhan.
 * TODO(Farhan): POS sessions, returns (roadmap 5.6).
 *
 * Posting a sale (ADR 0022 sections 1 and 2): the payload `POST /v1/invoices` takes and the answer it gives. Money and
 * quantities are strings, never numbers. The client sends no price, no cost and no date: prices come from the product
 * at sale time (P-07), the cost from the stock ledger, and the business date from the server clock in Asia/Dhaka.
 */
export const salesSchema = z.object({});

/** A quantity sold: above zero, up to 3 decimals, as a string. */
export const saleQuantitySchema = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,3})?$/, 'A quantity with up to 3 decimals')
  .refine((qty) => !/^0+(\.0+)?$/.test(qty), 'More than zero');

const positiveMoneySchema = moneySchema.refine(
  (amount) => !amount.startsWith('-') && !/^0+\.00$/.test(amount),
  'More than zero',
);
const nonNegativeMoneySchema = moneySchema.refine((amount) => !amount.startsWith('-'), 'Zero or more');

/** A payment taken at the sale: the transaction id is required for every method but cash (ADR 0016). */
export const salePaymentDraftSchema = z
  .object({
    method: paymentMethodSchema,
    amount: positiveMoneySchema,
    externalRef: z.string().trim().min(1).max(64).nullable(),
  })
  .strict()
  .refine((payment) => payment.method === 'cash' || payment.externalRef !== null, {
    message: 'Bank, bKash and card payments need the transaction id.',
    path: ['externalRef'],
  });

export const saleLineDraftSchema = z
  .object({
    productId: z.uuid(),
    /** The unit sold, for a serial-tracked product; null for counted items. */
    serialUnitId: z.uuid().nullable(),
    qty: saleQuantitySchema,
  })
  .strict()
  .refine((line) => line.serialUnitId === null || /^1(\.0{1,3})?$/.test(line.qty), {
    message: 'A serial unit is sold one at a time.',
    path: ['qty'],
  });

/** `POST /v1/invoices`. A payment total below the invoice total leaves a due (ADR 0016: "due" is not a method). */
export const postInvoiceSchema = z
  .object({
    /** The customer, or the walk-in party. Unchecked until the party table exists (known gap 2). */
    partyId: z.uuid(),
    /** The name printed on the invoice (ADR 0022 amendment, 24 Nov); null for a walk-in. */
    customerName: z.string().trim().min(1).max(200).nullable(),
    lines: z.array(saleLineDraftSchema).min(1).max(100),
    discount: nonNegativeMoneySchema,
    payments: z.array(salePaymentDraftSchema).max(4),
  })
  .strict();

/** A posted invoice's document status (ADR 0022: posted or voided). Renamed in demo-local4 only: the UI's
 * provisional invoiceStatusSchema (paid, partly paid, due) uses the old name. */
export const invoiceDocumentStatusSchema = z.enum(['posted', 'voided']);

/** The answer to a posted sale. Never carries a unit cost (a hidden field, plan 2.5). */
export const postedInvoiceSchema = z
  .object({
    id: z.uuid(),
    number: z.string().min(1),
    invoiceDate: z.iso.date(),
    partyId: z.uuid(),
    customerName: z.string().min(1).nullable(),
    subtotal: moneySchema,
    discount: moneySchema,
    total: moneySchema,
    paid: moneySchema,
    due: moneySchema,
    status: invoiceDocumentStatusSchema,
    lines: z.array(
      z
        .object({
          lineNo: z.number().int().positive(),
          productId: z.uuid(),
          serialUnitId: z.uuid().nullable(),
          qty: z.string().min(1),
          unitPrice: moneySchema,
          lineTotal: moneySchema,
        })
        .strict(),
    ),
    payments: z.array(
      z
        .object({
          id: z.uuid(),
          receiptNumber: z.string().min(1),
          method: paymentMethodSchema,
          amount: moneySchema,
          externalRef: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

// Customer payments and dues (A15, #47): POST /v1/payments takes recordPaymentSchema (ADR 0057).
/** Every method except cash needs the external transaction id (ADR 0016 draft, Moto Mart decision). */
const METHODS_WITHOUT_EXTERNAL_REF: ReadonlySet<string> = new Set(['cash']);

export const paymentStatusSchema = z.enum(['posted', 'voided']);

/** Optional free text, trimmed; a blank value counts as none (null). */
const blankAsNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable();

/**
 * POST /v1/payments body, the payment entry form. Refusals carry a stable code in the issue's `params.code`,
 * the same codes as SalesPaymentRecorder (#99): `payment.amount_invalid`, `payment.external_ref_required`.
 * The server sets the branch (ADR 0007), the receipt number (ADR 0015) and the business date, so the client
 * cannot send them: unknown keys are stripped.
 * The request also carries an `Idempotency-Key` header (ADR 0011); that is not part of the body.
 */
export const recordPaymentSchema = z
  .object({
    partyId: z.uuid(),
    /** Null for an advance: money received before the invoice exists (a liability, B-02). */
    invoiceId: z.uuid().nullable(),
    method: paymentMethodSchema,
    // Zod runs a refine even when the regex failed, so the pattern is checked first.
    amount: moneySchema.refine((amount) => MONEY_PATTERN.test(amount) && parseMoney(amount) > ZERO, {
      message: 'The amount must be above zero',
      params: { code: 'payment.amount_invalid' },
    }),
    externalRef: blankAsNull(64),
    note: blankAsNull(500),
  })
  .refine((p) => METHODS_WITHOUT_EXTERNAL_REF.has(p.method) || p.externalRef !== null, {
    message: 'This payment method needs the transaction id.',
    path: ['externalRef'],
    params: { code: 'payment.external_ref_required' },
  });

/** A recorded payment, read back (a receipt or a row of the customer's payments). */
export const salesPaymentSchema = z.object({
  id: z.uuid(),
  receiptNumber: z.string().min(1).max(32),
  partyId: z.uuid(),
  invoiceId: z.uuid().nullable(),
  branchId: z.uuid(),
  method: paymentMethodSchema,
  externalRef: z.string().min(1).max(64).nullable(),
  amount: moneySchema,
  status: paymentStatusSchema,
  /** ISO 8601, UTC. */
  receivedAt: z.iso.datetime(),
  note: z.string().max(500).nullable(),
});

export const salesPaymentListResponseSchema = cursorPageSchema(salesPaymentSchema);

/** One invoice the customer has not fully paid. */
export const openInvoiceSchema = z.object({
  invoiceId: z.uuid(),
  invoiceNumber: z.string().min(1).max(32),
  /** The invoice's business date in Asia/Dhaka (YYYY-MM-DD), not a timestamp. */
  invoiceDate: z.iso.date(),
  total: moneySchema,
  paid: moneySchema,
  due: moneySchema,
});

/**
 * GET /v1/parties/:id/dues: what the customer owes, read from the ledger (invariant 1), never a stored
 * field. `advance` is money received before an invoice, held as a liability.
 */
export const customerDuesSchema = z.object({
  partyId: z.uuid(),
  totalDue: moneySchema,
  advance: moneySchema,
  openInvoices: z.array(openInvoiceSchema),
});
