/**
 * What PostingService needs from the accounting core's dal (ADR 0013, item 2b). Owned here; dal's JournalQuery
 * satisfies it. Money is a two-decimal string; every call runs in the caller's tenant transaction.
 */
export interface JournalRecord {
  branchId: string;
  number: string;
  /** "YYYY-MM-DD"; null takes today in Asia/Dhaka by the database clock. */
  date: string | null;
  sourceType: string;
  sourceId: string;
  memo: string;
  reversalOf: string | null;
}

export interface JournalLineRecord {
  accountId: string;
  debit: string;
  credit: string;
  partyId: string | null;
}

/** A posted journal as a reversal needs it. */
export interface OriginalJournal {
  id: string;
  branchId: string;
  reversalOf: string | null;
}

export interface IJournalQuery {
  /** The business's account for each role asked for, read FOR SHARE so a mapping can't change mid-post. */
  roleAccounts(roles: readonly string[]): Promise<{ role: string; accountId: string }[]>;
  /** Of the given party ids, those that are parties of the caller's business (RLS-scoped; decision 4). */
  knownParties(partyIds: readonly string[]): Promise<string[]>;
  /** Inserts the journal; null when a unique key already holds it (ON CONFLICT DO NOTHING, so never a 500 race). */
  insertJournal(row: JournalRecord): Promise<string | null>;
  /** Whether a journal for this source is visible in the scope (posts once, invariant 4). */
  isPosted(sourceType: string, sourceId: string): Promise<boolean>;
  insertLines(journalId: string, lines: JournalLineRecord[]): Promise<void>;
  /** The journal if visible in the caller's scope, else null. */
  findJournal(journalId: string): Promise<OriginalJournal | null>;
  /** Copies the original's lines onto the reversal with debit and credit swapped. */
  insertMirrorLines(reversalId: string, originalId: string): Promise<void>;
}
