import type { FollowUpChannel, FollowUpOutcome, PromiseStatus } from '@erp/shared';

/** A follow-up row as the follow-up table will hold it (CR-05). Money is a two-decimal string. */
export interface NewFollowUp {
  branchId: string;
  partyId: string;
  collectorId: string;
  channel: FollowUpChannel;
  outcome: FollowUpOutcome;
  /** Null unless the outcome is `promised`. */
  promise: { promisedOn: string; amount: string; status: PromiseStatus } | null;
  note: string | null;
  /** The server's clock, never the caller's. */
  contactedAt: Date;
  /** The caller (req.auth), never the body. */
  createdBy: string;
}

/** What FollowUpRecorder needs from dal. The follow-up table and its Query come in a later PR (Farhan). */
export interface IFollowUpQuery {
  /**
   * The party as a follow-up needs it, read under RLS: null when it doesn't exist in the caller's business.
   * `isWalkIn` marks the business's walk-in customer (ADR 0006), which has no dues to follow up.
   */
  partyForFollowUp(partyId: string): Promise<{ isWalkIn: boolean } | null>;
  /** Inserts the row and returns its id (uuid_v7() from the database). */
  insertFollowUp(followUp: NewFollowUp): Promise<{ id: string }>;
}
