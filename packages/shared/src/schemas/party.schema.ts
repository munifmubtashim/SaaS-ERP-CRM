import { z } from 'zod';
import { cursorPageSchema, pageQuerySchema } from '../utils/pagination.js';

/**
 * Party module, Zod schemas shared by backend and frontend. Owner: Farhan.
 * One party is a customer, a supplier or both, and belongs to one business (ADR 0006 draft).
 * Read shapes only for now (task F1). Create and edit payloads come with F2.
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
