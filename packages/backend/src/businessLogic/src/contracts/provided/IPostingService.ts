/**
 * Published by Accounting for every module that posts (ADR 0012 section 2). Consumers depend on this interface
 * only; createManagers passes the one PostingService (ADR 0013) where it is needed. Runs in the caller's ambient
 * transaction (ADR 0005) and never opens one.
 */

/**
 * Account roles, not account codes: Accounting maps each to an account per business (ADR 0013 account_role). The
 * 12 decided on 23 Nov: ADR 0012's eight plus what sale posting needs; the database CHECK holds the same list.
 */
export const ACCOUNT_ROLES = [
  'cash',
  'bank',
  'mobile_money',
  'card_clearing',
  'receivable',
  'customer_advance',
  'pass_through_payable',
  'sales_revenue',
  'inventory',
  'cost_of_goods_sold',
  'vat_output_payable',
  'service_revenue',
] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Money as a two-decimal string ("12500.00"); summed only with shared/src/utils/money. */
export type MoneyString = string;

export interface JournalLineDraft {
  role: AccountRole;
  debit: MoneyString;
  credit: MoneyString;
  partyId?: string;
}

export interface JournalDraft {
  /** The business comes from the scope (ADR 0005, 0007). */
  branchId: string;
  /** Business date in Asia/Dhaka, "YYYY-MM-DD". */
  date: string;
  /** The source document, e.g. { type: 'sales_payment', id }. Posted at most once (invariant 4). */
  source: { type: string; id: string };
  memo: string;
  lines: JournalLineDraft[];
}

export interface PostedJournal {
  journalId: string;
  number: string;
}

export interface IPostingService {
  /**
   * Posts one balanced journal. Refuses: unbalanced, a line with both or neither side, fewer than two lines
   * (500 journal.unbalanced); an unmapped role (409 journal.role_unmapped); a locked period (409 period.locked);
   * a source already posted (409 journal.already_posted).
   */
  post(draft: JournalDraft): Promise<PostedJournal>;
  /**
   * Posts the mirror of a posted journal, pointing at it, dated today in Asia/Dhaka. Refuses: a journal not visible
   * in the scope (404); a second reversal (409 journal.already_reversed); a reversal of a reversal
   * (409 journal.reversal_of_reversal).
   */
  reverse(journalId: string, reason: string): Promise<PostedJournal>;
}
