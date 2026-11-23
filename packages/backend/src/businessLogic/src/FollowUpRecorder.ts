import {
  AppError,
  businessDateInDhaka,
  formatMoney,
  parseMoney,
  type FollowUp,
  type RecordFollowUp,
} from '@erp/shared';
import type { IClock } from './contracts/IClock.js';
import type { IFollowUpQuery } from './contracts/IFollowUpQuery.js';

/**
 * Records a follow-up with an overdue customer, and any promise to pay (spec CR-05), inside the caller's request
 * transaction. The shape (outcome and promise agree, amount above zero) is checked by recordFollowUpSchema; this
 * class adds the rules that need today's date and the party. Crm (Farhan) owns it; it waits for the follow-up
 * table before createManagers wires it, the way SalesPaymentRecorder waits for A15's (#99).
 */
export class FollowUpRecorder {
  constructor(
    private readonly query: IFollowUpQuery,
    private readonly clock: IClock,
  ) {}

  /** The branch comes from the request (ADR 0007) and the caller from req.auth, never from the body. */
  async record(branchId: string, input: RecordFollowUp, recordedBy: string): Promise<FollowUp> {
    const contactedAt = this.clock.now();
    const promise = input.promise && {
      promisedOn: input.promise.promisedOn,
      // One stored form: "05000.00" is stored as "5000.00", as payments do (#99).
      amount: formatMoney(parseMoney(input.promise.amount)),
      // Only the server sets the status; kept or broken is worked out later from payments.
      status: 'open' as const,
    };
    // Business dates in ISO form (YYYY-MM-DD) compare correctly as strings. Today itself is allowed.
    if (promise && promise.promisedOn < businessDateInDhaka(contactedAt)) {
      const message = 'The promise date cannot be before today.';
      throw new AppError('VALIDATION_FAILED', message, [
        { path: 'promise.promisedOn', code: 'followup.promise_date_past', message },
      ]);
    }
    await this.refuseUnfollowableParty(input.partyId);

    const { id } = await this.query.insertFollowUp({
      branchId,
      partyId: input.partyId,
      collectorId: input.collectorId,
      channel: input.channel,
      outcome: input.outcome,
      promise,
      note: input.note,
      contactedAt,
      createdBy: recordedBy,
    });
    return {
      id,
      partyId: input.partyId,
      collectorId: input.collectorId,
      channel: input.channel,
      outcome: input.outcome,
      promise,
      note: input.note,
      contactedAt: contactedAt.toISOString(),
    };
  }

  /**
   * The party must exist in the caller's business; one in another business gets the same 404 as an unknown id,
   * so ids can't be probed. The walk-in customer has no dues to follow up (ADR 0006).
   */
  private async refuseUnfollowableParty(partyId: string): Promise<void> {
    const party = await this.query.partyForFollowUp(partyId);
    if (!party) {
      const message = 'Customer not found.';
      throw new AppError('NOT_FOUND', message, [
        { path: 'partyId', code: 'followup.party_not_found', message },
      ]);
    }
    if (party.isWalkIn) {
      const message = 'The walk-in customer has no dues to follow up.';
      throw new AppError('CONFLICT', message, [
        { path: 'partyId', code: 'followup.walk_in_not_allowed', message },
      ]);
    }
  }
}
