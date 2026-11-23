import { z } from 'zod';
import { MONEY_PATTERN, ZERO, moneySchema, parseMoney } from '../utils/money.js';
import { cursorPageSchema, pageQuerySchema } from '../utils/pagination.js';

/**
 * Crm module, Zod schemas shared by backend and frontend. Owner: Farhan.
 * Follow-ups and promises to pay (spec CR-05, build plan row F1): shapes only, for the follow-ups screen on a
 * mock service and CrmManager's rules. No table or route yet. Refusals carry a stable code in the issue's
 * `params.code`.
 * TODO(Farhan): leads, feedback and complaints (F2), templates and campaigns (roadmap 5.11).
 */
export const crmSchema = z.object({});

/** How the collector reached the customer. */
export const followUpChannelSchema = z.enum(['call', 'visit', 'message']);
/** What came of it. Only `promised` carries a promise to pay. */
export const followUpOutcomeSchema = z.enum(['promised', 'no_answer', 'refused', 'paid', 'other']);
/**
 * A promise's state, set by the server, never by the client: `open` until its date, then `kept` or `broken`
 * from the customer's payments. Broken promises go to the Action Center (Report, Munif).
 */
export const promiseStatusSchema = z.enum(['open', 'kept', 'broken']);

/** A promise to pay: the date the customer named (a Dhaka business date) and the amount. */
export const promiseToPaySchema = z.object({
  promisedOn: z.iso.date(),
  // Zod runs a refine even when the regex failed, so the pattern is checked first.
  amount: moneySchema.refine((amount) => MONEY_PATTERN.test(amount) && parseMoney(amount) > ZERO, {
    message: 'The promised amount must be above zero',
    params: { code: 'followup.amount_invalid' },
  }),
});

/**
 * POST /v1/follow-ups body. The server sets the id, business, branch, contact time and promise status, so
 * the client cannot send them: unknown keys are stripped. The collector is picked in the form, not taken
 * from the login, because staff may share a login (Moto Mart). Whether the promise date may be in the past
 * and whether the party may be followed up (not walk-in) are CrmManager's rules: they need today's date and
 * the party.
 */
export const recordFollowUpSchema = z
  .object({
    partyId: z.uuid(),
    /** The staff member following up. A plain id until the staff table exists (A4). */
    collectorId: z.uuid(),
    channel: followUpChannelSchema,
    outcome: followUpOutcomeSchema,
    promise: promiseToPaySchema.nullable(),
    /** Trimmed; a blank note counts as none. */
    note: z
      .string()
      .trim()
      .max(500)
      .transform((s) => (s === '' ? null : s))
      .nullable(),
  })
  .superRefine((f, ctx) => {
    if (f.outcome === 'promised' && f.promise === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['promise'],
        message: 'A promise to pay needs its date and amount.',
        params: { code: 'followup.promise_required' },
      });
    }
    if (f.outcome !== 'promised' && f.promise !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['promise'],
        message: 'Only a "promised" follow-up has a promise to pay.',
        params: { code: 'followup.promise_not_allowed' },
      });
    }
  });

/** A recorded follow-up, read back (a row of the follow-ups list). */
export const followUpSchema = z.object({
  id: z.uuid(),
  partyId: z.uuid(),
  collectorId: z.uuid(),
  channel: followUpChannelSchema,
  outcome: followUpOutcomeSchema,
  promise: promiseToPaySchema.extend({ status: promiseStatusSchema }).nullable(),
  note: z.string().max(500).nullable(),
  /** ISO 8601, UTC. */
  contactedAt: z.iso.datetime(),
});

/** GET /v1/follow-ups: one customer's follow-ups, or every broken promise, a page at a time. */
export const followUpListQuerySchema = pageQuerySchema.extend({
  partyId: z.uuid().optional(),
  promiseStatus: promiseStatusSchema.optional(),
});

/**
 * A row of the follow-ups list: the follow-up plus the names the screen shows, so the list needs no second
 * request per row. The collector's name comes from the staff table once it exists (A4).
 */
export const followUpListItemSchema = followUpSchema.extend({
  partyName: z.string().trim().min(1).max(200),
  collectorName: z.string().trim().min(1).max(200),
});

export const followUpListResponseSchema = cursorPageSchema(followUpListItemSchema);
