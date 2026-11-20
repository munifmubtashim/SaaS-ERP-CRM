import { z } from 'zod';
import { MONEY_PATTERN, ZERO, moneySchema, parseMoney } from '../utils/money.js';
import { cursorPageSchema } from '../utils/pagination.js';

/**
 * Sales module, Zod schemas shared by backend and frontend. Owner: Farhan.
 * TODO(Farhan): invoices, POS sessions, returns (roadmap 5.6).
 * Customer payments and dues (A15) are here: shapes only, for the screens on mock services. Posting a
 * payment's journal is A16 (ADR 0016, draft): nothing here posts or decides an account.
 */
export const salesSchema = z.object({});

/** ADR 0016 draft: Cash, Bank, bKash and Card, all entered by hand. A new method is added here. */
export const paymentMethodSchema = z.enum(['cash', 'bank', 'bkash', 'card']);
/** Every method except cash needs the external transaction id (ADR 0016 draft, Moto Mart decision). */
const METHODS_WITHOUT_EXTERNAL_REF: ReadonlySet<string> = new Set(['cash']);

export const paymentStatusSchema = z.enum(['posted', 'voided']);

/**
 * POST /v1/payments body, the payment entry form. The server sets the branch (ADR 0007), the receipt
 * number (ADR 0015) and the business date, so the client cannot send them: unknown keys are stripped.
 * The request also carries an `Idempotency-Key` header (ADR 0011); that is not part of the body.
 */
export const recordPaymentSchema = z
  .object({
    partyId: z.uuid(),
    /** Null for an advance: money received before the invoice exists (a liability, B-02). */
    invoiceId: z.uuid().nullable(),
    method: paymentMethodSchema,
    // Zod runs a refine even when the regex failed, so the pattern is checked first.
    amount: moneySchema.refine(
      (amount) => MONEY_PATTERN.test(amount) && parseMoney(amount) > ZERO,
      'The amount must be above zero',
    ),
    /** A blank id counts as no id. */
    externalRef: z
      .string()
      .trim()
      .max(64)
      .transform((s) => (s === '' ? null : s))
      .nullable(),
    note: z.string().trim().max(500).nullable(),
  })
  .refine((p) => METHODS_WITHOUT_EXTERNAL_REF.has(p.method) || p.externalRef !== null, {
    message: 'This payment method needs the transaction id.',
    path: ['externalRef'],
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
  /** ISO 8601, UTC. */
  invoiceDate: z.iso.datetime(),
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
