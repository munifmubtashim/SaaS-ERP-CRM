import { z } from 'zod';
import { MONEY_PATTERN, ZERO, moneySchema, parseMoney } from '../utils/money.js';
import { cursorPageSchema, pageQuerySchema } from '../utils/pagination.js';

/**
 * Party module, Zod schemas shared by backend and frontend. Owner: Farhan.
 * One party is a customer, a supplier or both, and belongs to one business (ADR 0006 draft).
 * Read shapes only for now (task F1). Create and edit payloads come with F2.
 * The national ID appears here only as its last four digits (`nidLast4` on the profile); the full NID has its
 * own restricted route and schema (ADR 0001 row 2).
 */
export const partyKindSchema = z.enum(['person', 'company']);
export const partyStatusSchema = z.enum(['active', 'inactive']);
export const partyRoleSchema = z.enum(['customer', 'supplier']);

/** Stored and sent in E.164 (`+8801700000001`). The form normalises what the user types. */
const phoneSchema = z.e164();

/**
 * Every Party field rule, written once. It has NO refinement on purpose: in Zod 4, `.pick()` and `.omit()`
 * throw on an object that carries a refinement, so derived shapes (list row, and later the F2 create and
 * edit payloads) are picked from this base, and object-level rules are added on each derived schema.
 */
export const partyBaseSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  nameBn: z.string().min(1).max(200).nullable(),
  kind: partyKindSchema,
  isCustomer: z.boolean(),
  isSupplier: z.boolean(),
  phone: phoneSchema,
  altPhone: phoneSchema.nullable(),
  email: z.email().nullable(),
  address: z.string().max(500).nullable(),
  area: z.string().max(100).nullable(),
  status: partyStatusSchema,
  /** ISO 8601, UTC. */
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Optimistic concurrency: an edit sends back the version it read. */
  version: z.number().int().min(1),
});

/** Object-level rule shared by every full party shape. */
const isCustomerOrSupplier = (p: { isCustomer: boolean; isSupplier: boolean }) =>
  p.isCustomer || p.isSupplier;
const customerOrSupplierIssue = {
  message: 'A party must be a customer, a supplier or both.',
  path: ['isCustomer'],
};

export const partySchema = partyBaseSchema.refine(isCustomerOrSupplier, customerOrSupplierIssue);

/**
 * A credit limit: a money string of zero or more. Null means no limit is set, so no check (C17).
 * The refusal carries the stable code `credit.limit_invalid` in the issue's `params.code`.
 */
const creditLimitSchema = moneySchema.refine(
  // Zod runs a refine even when the regex failed, so the pattern is checked first.
  (amount) => MONEY_PATTERN.test(amount) && parseMoney(amount) >= ZERO,
  { message: 'A credit limit cannot be negative', params: { code: 'credit.limit_invalid' } },
);

/**
 * GET /v1/parties/:id, the customer profile (ADR 0006). The national ID appears only as its last four
 * digits; the full NID has its own restricted route. Balance and dues are not here: they come from the
 * ledger, through the dues route (`customerDuesSchema` in sales).
 */
export const partyDetailSchema = partyBaseSchema
  .extend({
    nidLast4: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    creditLimit: creditLimitSchema.nullable(),
    /** Days a customer has to pay an invoice; null means the business default. */
    payTermDays: z.number().int().min(0).max(365).nullable(),
    onCreditHold: z.boolean(),
    /** The business's walk-in customer (ADR 0006): no advance, credit limit or dues. */
    isWalkIn: z.boolean(),
  })
  .refine(isCustomerOrSupplier, customerOrSupplierIssue);

/** One row of a party list. Unknown keys are stripped, so nothing extra (such as an NID) can leak through. */
export const partyListItemSchema = partyBaseSchema.pick({
  id: true,
  code: true,
  name: true,
  nameBn: true,
  kind: true,
  isCustomer: true,
  isSupplier: true,
  phone: true,
  area: true,
  status: true,
});

/** GET /v1/parties query: search by name, code or phone; filter by role and status; cursor page. */
export const partyListQuerySchema = pageQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(100)
    .transform((s) => (s === '' ? undefined : s))
    .optional(),
  role: partyRoleSchema.optional(),
  status: partyStatusSchema.optional(),
});

export const partyListResponseSchema = cursorPageSchema(partyListItemSchema);
