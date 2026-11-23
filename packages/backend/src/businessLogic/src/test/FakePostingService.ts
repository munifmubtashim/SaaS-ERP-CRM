import { randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import type {
  AccountRole,
  IPostingService,
  JournalDraft,
  PostedJournal,
} from '../contracts/provided/IPostingService.js';
import { assertBalancedDraft } from '../JournalDraftRules.js';

interface FakeJournal extends PostedJournal {
  draft: JournalDraft | null;
  reversalOf: string | null;
}

/**
 * In-memory IPostingService for consumers' unit tests (ADR 0012 section 5). It passes the same contract suite as
 * the real PostingService. Records every journal; `failNextWith` makes the next call throw that error.
 */
export class FakePostingService implements IPostingService {
  readonly journals: FakeJournal[] = [];
  failNextWith: AppError | null = null;
  private readonly unmapped: ReadonlySet<AccountRole>;

  constructor(options: { unmappedRoles?: AccountRole[] } = {}) {
    this.unmapped = new Set(options.unmappedRoles ?? []);
  }

  async post(draft: JournalDraft): Promise<PostedJournal> {
    this.throwIfTold();
    assertBalancedDraft(draft);
    const unmapped = draft.lines.find((line) => this.unmapped.has(line.role));
    if (unmapped) throw conflict('journal.role_unmapped', `No account is mapped to role ${unmapped.role}.`);
    const already = this.journals.some(
      (j) => j.draft?.source.type === draft.source.type && j.draft.source.id === draft.source.id,
    );
    if (already) throw conflict('journal.already_posted', 'This source document is already posted.');
    return this.record(draft, null);
  }

  async reverse(journalId: string, _reason: string): Promise<PostedJournal> {
    this.throwIfTold();
    if (!this.journals.some((j) => j.journalId === journalId)) {
      throw new AppError('NOT_FOUND', 'Journal not found.');
    }
    if (this.journals.some((j) => j.reversalOf === journalId)) {
      throw conflict('journal.already_reversed', 'This journal is already reversed.');
    }
    return this.record(null, journalId);
  }

  private record(draft: JournalDraft | null, reversalOf: string | null): PostedJournal {
    const journal = {
      journalId: randomUUID(),
      number: `J-${this.journals.length + 1}`,
      draft,
      reversalOf,
    };
    this.journals.push(journal);
    return { journalId: journal.journalId, number: journal.number };
  }

  private throwIfTold(): void {
    const error = this.failNextWith;
    if (error) {
      this.failNextWith = null;
      throw error;
    }
  }
}

function conflict(code: string, message: string): AppError {
  return new AppError('CONFLICT', message, [{ path: 'journal', code, message }]);
}
