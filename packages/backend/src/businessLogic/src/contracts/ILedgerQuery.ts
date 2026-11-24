/** What LedgerReader needs from the accounting core's dal (M4). Owned here; dal's LedgerQuery satisfies it. */
export interface LedgerAccountTotals {
  accountId: string;
  code: string;
  name: string;
  type: string;
  /** Summed by the database, numeric(18,2) as text. */
  debit: string;
  credit: string;
}

export interface ILedgerQuery {
  /** Receivable and customer_advance net amounts for the party, in the caller's scope, as numeric(18,2) text. */
  partyBalances(partyId: string): Promise<{ receivable: string; customerAdvance: string }>;
  /** Per-account debit and credit totals for journals dated on or before `asOf` (all when null), by code. */
  accountTotals(asOf: string | null): Promise<LedgerAccountTotals[]>;
}
