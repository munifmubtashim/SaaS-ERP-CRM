import type { MoneyString } from './IPostingService.js';

/** A customer's standing in the ledger (ADR 0024 question 1, ADR 0026 section 3), as money strings. */
export interface PartyBalances {
  /** Still owed by the customer: debits less credits on receivable lines naming the party. */
  receivable: MoneyString;
  /** Held for the customer: credits less debits on customer_advance lines naming the party (a liability). */
  customerAdvance: MoneyString;
}

/**
 * Published by Accounting (ADR 0012 pattern; M4): a party's balances from the journal lines (invariant 1: the ledger is
 * the truth). Runs in the caller's transaction and scope, so another business's party reads as zero, and a branch
 * scope sees its branches' journals only. Used by the dues read (ADR 0026, Farhan's F5) and the credit check (ADR 0024).
 */
export interface IPartyLedger {
  balances(partyId: string): Promise<PartyBalances>;
}
