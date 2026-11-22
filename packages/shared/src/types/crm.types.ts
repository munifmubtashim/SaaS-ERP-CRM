import type { z } from 'zod';
import type {
  crmSchema,
  followUpChannelSchema,
  followUpListQuerySchema,
  followUpListResponseSchema,
  followUpOutcomeSchema,
  followUpSchema,
  promiseStatusSchema,
  promiseToPaySchema,
  recordFollowUpSchema,
} from '../schemas/crm.schema.js';

/**
 * Crm module, types inferred from the Zod schemas. Owner: Farhan.
 * TODO(Farhan): leads, feedback and complaints (F2), templates and campaigns (roadmap 5.11).
 */
export type Crm = z.infer<typeof crmSchema>;
export type FollowUpChannel = z.infer<typeof followUpChannelSchema>;
export type FollowUpOutcome = z.infer<typeof followUpOutcomeSchema>;
export type PromiseStatus = z.infer<typeof promiseStatusSchema>;
export type PromiseToPay = z.infer<typeof promiseToPaySchema>;
/** What the follow-up form sends (before trimming). */
export type RecordFollowUpInput = z.input<typeof recordFollowUpSchema>;
/** What the server works with after parsing. */
export type RecordFollowUp = z.infer<typeof recordFollowUpSchema>;
export type FollowUp = z.infer<typeof followUpSchema>;
/** What the caller may send (limit optional, as text or number). */
export type FollowUpListQueryInput = z.input<typeof followUpListQuerySchema>;
export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
export type FollowUpListResponse = z.infer<typeof followUpListResponseSchema>;
