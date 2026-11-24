import { z } from 'zod';
import { moneySchema } from '../utils/money.js';
import { cursorPageSchema, pageQuerySchema } from '../utils/pagination.js';
import { toE164 } from '../utils/phone.js';

/**
 * Party module, Zod schemas shared by backend and frontend. Owner: Farhan.
 * One party is a customer, a supplier or both, and belongs to one business (ADR 0006 draft).
 * Read shapes (task F1), and the create and edit payloads (F2, ADR 0056 section 3).
 * Never add the national ID here: it has its own restricted route and schema (ADR 0001 row 2).
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

export const partySchema = partyBaseSchema.refine((p) => p.isCustomer || p.isSupplier, {
  message: 'A party must be a customer, a supplier or both.',
  path: ['isCustomer'],
});

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

/** A phone as the user types it, stored in E.164 (ADR 0019 section 4): the form and the API call the same rule. */
const typedPhoneSchema = z.string().transform((raw, ctx) => {
  const e164 = toE164(raw);
  if (e164 === null) {
    ctx.addIssue({ code: 'custom', message: 'Enter a Bangladesh mobile number or +country code.' });
    return z.NEVER;
  }
  return e164;
});

/** Blank becomes null (the F2 form sends null for a blank Bangla name; #24). */
const blankToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === null || s === '' ? null : s));

/** The fields a user enters. Everything else (id, business, code, status, version, creator) is the server's. */
const partyInputFields = partyBaseSchema
  .pick({
    name: true,
    kind: true,
    isCustomer: true,
    isSupplier: true,
    email: true,
    address: true,
    area: true,
  })
  .extend({
    nameBn: blankToNull(200),
    phone: typedPhoneSchema,
    altPhone: typedPhoneSchema.nullable(),
    /** null = no limit (spec S-15). A money string, zero or more. */
    creditLimit: moneySchema.refine((m) => !m.startsWith('-'), 'Zero or more').nullable(),
    /** null = the business default. */
    payTermDays: z.number().int().min(0).max(365).nullable(),
  });

/** Save even though another active party of the business has the same phone (ADR 0019 section 4). */
const confirmDuplicateSchema = z.boolean().default(false);

/** POST /v1/parties (ADR 0056 section 3). */
export const createPartySchema = partyInputFields
  .extend({ confirmDuplicate: confirmDuplicateSchema })
  .strict()
  .refine((p) => p.isCustomer || p.isSupplier, {
    message: 'A party must be a customer, a supplier or both.',
    path: ['isCustomer'],
  });

/** PATCH /v1/parties/:id: the version read, and only the fields that change. */
export const updatePartySchema = partyInputFields
  .partial()
  .extend({ version: z.number().int().min(1), confirmDuplicate: confirmDuplicateSchema })
  .strict()
  .refine((p) => p.isCustomer !== false || p.isSupplier !== false, {
    message: 'A party must be a customer, a supplier or both.',
    path: ['isCustomer'],
  });

/** POST /v1/parties/:id/deactivate: the version read (ADR 0056 section 4). */
export const deactivatePartySchema = z.object({ version: z.number().int().min(1) }).strict();
