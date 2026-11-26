import { AppError } from '@erp/shared';
import type { IJournalQuery } from './contracts/IJournalQuery.js';
import type { INumberSeries } from './contracts/provided/INumberSeries.js';
import type {
  AccountRole,
  IPostingService,
  JournalDraft,
  PostedJournal,
} from './contracts/provided/IPostingService.js';
import { assertBalancedDraft } from './JournalDraftRules.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function conflict(code: string, message: string): AppError {
  return new AppError('CONFLICT', message, [{ path: 'journal', code, message }]);
}

/**
 * Accounting's posting service (ADR 0012 section 2, ADR 0013 part 2). Runs in the caller's transaction and never
 * opens one (invariant 4): a refusal throws and the caller's whole transaction rolls back, so a refused call writes
 * nothing and gives its journal number back. The draft is checked before any SQL; the database checks it again at
 * commit. The journal number is taken last, after the caller's own document numbers (ADR 0015, #60).
 */
export class PostingService implements IPostingService {
  constructor(
    private readonly journals: IJournalQuery,
    private readonly numbers: INumberSeries,
  ) {}

  async post(draft: JournalDraft): Promise<PostedJournal> {
    assertBalancedDraft(draft);
    if (!ISO_DATE.test(draft.date)) {
      const message = `Not a YYYY-MM-DD business date: ${draft.date}`;
      throw new AppError('INTERNAL_ERROR', message, [{ path: 'date', code: 'journal.bad_date', message }]);
    }
    const accounts = await this.accountsFor(draft.lines.map((line) => line.role));
    await this.refuseUnknownParties(draft.lines.flatMap((line) => (line.partyId ? [line.partyId] : [])));
    const number = await this.numbers.next('journal', draft.branchId);
    const journalId = await this.journals.insertJournal({
      branchId: draft.branchId,
      number,
      date: draft.date,
      sourceType: draft.source.type,
      sourceId: draft.source.id,
      memo: draft.memo,
      reversalOf: null,
    });
    if (!journalId)
      throw await this.whyNotInserted(draft.source.type, draft.source.id, 'journal.already_posted');
    await this.journals.insertLines(
      journalId,
      draft.lines.map((line) => ({
        accountId: accounts.get(line.role) ?? '',
        debit: line.debit,
        credit: line.credit,
        partyId: line.partyId ?? null,
      })),
    );
    return { journalId, number };
  }

  async reverse(journalId: string, reason: string): Promise<PostedJournal> {
    const original = await this.journals.findJournal(journalId);
    if (!original) throw new AppError('NOT_FOUND', 'Journal not found.');
    if (original.reversalOf) {
      throw conflict(
        'journal.reversal_of_reversal',
        'A reversal cannot be reversed; post a new journal instead.',
      );
    }
    const number = await this.numbers.next('journal', original.branchId);
    const reversalId = await this.journals.insertJournal({
      branchId: original.branchId,
      number,
      date: null,
      sourceType: 'reversal',
      sourceId: original.id,
      memo: reason,
      reversalOf: original.id,
    });
    if (!reversalId) throw await this.whyNotInserted('reversal', original.id, 'journal.already_reversed');
    await this.journals.insertMirrorLines(reversalId, original.id);
    return { journalId: reversalId, number };
  }

  /** Every role mapped to an account in this business, or 409 journal.role_unmapped naming the missing ones. */
  private async accountsFor(roles: AccountRole[]): Promise<Map<string, string>> {
    const wanted = [...new Set(roles)];
    const found = new Map((await this.journals.roleAccounts(wanted)).map((r) => [r.role, r.accountId]));
    const missing = wanted.filter((role) => !found.has(role));
    if (missing.length > 0) {
      throw conflict('journal.role_unmapped', `No account is mapped to role ${missing.join(', ')}.`);
    }
    return found;
  }

  /**
   * Every party named on a line is a party of this business (decision 4), checked before any write so the refusal
   * is a clear 409, not the foreign key's error. The composite foreign key holds the same rule in the database.
   */
  private async refuseUnknownParties(partyIds: string[]): Promise<void> {
    const wanted = [...new Set(partyIds)];
    if (wanted.length === 0) return;
    const known = new Set(await this.journals.knownParties(wanted));
    if (wanted.some((id) => !known.has(id))) {
      throw conflict('journal.party_unknown', 'A journal line names a party that is not in this business.');
    }
  }

  /** ON CONFLICT DO NOTHING inserted nothing: the source is posted (409), or another key clashed (a bug, 500). */
  private async whyNotInserted(sourceType: string, sourceId: string, code: string): Promise<AppError> {
    if (await this.journals.isPosted(sourceType, sourceId)) {
      return conflict(
        code,
        code === 'journal.already_reversed'
          ? 'This journal is already reversed.'
          : 'This source document is already posted.',
      );
    }
    return new AppError(
      'INTERNAL_ERROR',
      'The journal was not written: a unique key other than its source clashed.',
    );
  }
}
