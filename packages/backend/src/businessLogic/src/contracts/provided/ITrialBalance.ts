import type { MoneyString } from './IPostingService.js';

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  /** asset, liability, equity, income or expense. */
  type: string;
  debit: MoneyString;
  credit: MoneyString;
  /** Debit less credit, signed: a liability or income account in credit is negative. */
  balance: MoneyString;
}

export interface TrialBalance {
  /** Accounts with activity up to the date, by code. */
  rows: TrialBalanceRow[];
  /** Equal whenever the books are right (invariant 1). */
  totals: { debit: MoneyString; credit: MoneyString };
}

/**
 * Published by Accounting (M4): the trial balance of the caller's scope, from the journal lines. `asOf` is a business
 * date "YYYY-MM-DD" (journals dated on or before it); left out, everything posted. Runs in the caller's transaction.
 */
export interface ITrialBalance {
  read(asOf?: string): Promise<TrialBalance>;
}
