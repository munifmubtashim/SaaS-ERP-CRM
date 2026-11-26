import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { AccountRole, IPostingService, JournalDraft } from '../contracts/provided/IPostingService.js';

/**
 * ADR 0012 test 1: the posting contract. Run against FakePostingService here, and against the real PostingService
 * in its integration tests (ADR 0013), so the fake can't drift. `make` builds a fresh service whose role mapping
 * leaves out `unmappedRoles`; `journalCount` says how many journals it holds.
 */
export interface PostingHarness {
  service: IPostingService;
  journalCount(): Promise<number>;
}

const BRANCH = '01937000-0000-7000-8000-0000000000e0';
let sourceSeq = 0;

export function draft(fields: Partial<JournalDraft> = {}): JournalDraft {
  sourceSeq += 1;
  return {
    branchId: BRANCH,
    date: '2026-11-22',
    source: { type: 'sales_payment', id: `src-${sourceSeq}` },
    memo: 'Payment',
    lines: [
      { role: 'cash', debit: '12500.00', credit: '0.00' },
      { role: 'receivable', debit: '0.00', credit: '12500.00' },
    ],
    ...fields,
  };
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; field: string | undefined }> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, field: (error as AppError).fields[0]?.code };
}

export function postingContract(
  name: string,
  make: (options?: { unmappedRoles?: AccountRole[] }) => Promise<PostingHarness>,
): void {
  describe(`${name} meets the IPostingService contract (ADR 0012 test 1)`, () => {
    it('a balanced draft posts and returns a journal id and number', async () => {
      const { service, journalCount } = await make();
      const posted = await service.post(draft());
      expect(posted.journalId).toEqual(expect.any(String));
      expect(posted.number).toEqual(expect.any(String));
      expect(await journalCount()).toBe(1);
    });

    it.each([
      [
        'unbalanced',
        [
          { role: 'cash', debit: '100.00', credit: '0.00' },
          { role: 'receivable', debit: '0.00', credit: '99.99' },
        ],
      ],
      [
        'a line with both sides',
        [
          { role: 'cash', debit: '100.00', credit: '100.00' },
          { role: 'receivable', debit: '0.00', credit: '0.00' },
        ],
      ],
      [
        'a line with neither side',
        [
          { role: 'cash', debit: '100.00', credit: '0.00' },
          { role: 'bank', debit: '0.00', credit: '0.00' },
          { role: 'receivable', debit: '0.00', credit: '100.00' },
        ],
      ],
      ['a single line', [{ role: 'cash', debit: '0.00', credit: '0.00' }]],
      [
        'a negative amount',
        [
          { role: 'cash', debit: '-100.00', credit: '0.00' },
          { role: 'receivable', debit: '-100.00', credit: '0.00' },
        ],
      ],
    ] as const)('%s is refused with 500 journal.unbalanced, nothing written', async (_case, lines) => {
      const { service, journalCount } = await make();
      expect(await refusal(service.post(draft({ lines: [...lines] })))).toEqual({
        code: 'INTERNAL_ERROR',
        field: 'journal.unbalanced',
      });
      expect(await journalCount()).toBe(0);
    });

    it('an unmapped role is refused with 409 journal.role_unmapped, nothing written', async () => {
      const { service, journalCount } = await make({ unmappedRoles: ['receivable'] });
      expect(await refusal(service.post(draft()))).toEqual({
        code: 'CONFLICT',
        field: 'journal.role_unmapped',
      });
      expect(await journalCount()).toBe(0);
    });

    it('the same source posted twice is refused with 409 journal.already_posted', async () => {
      const { service, journalCount } = await make();
      const first = draft();
      await service.post(first);
      expect(await refusal(service.post({ ...first }))).toEqual({
        code: 'CONFLICT',
        field: 'journal.already_posted',
      });
      expect(await journalCount()).toBe(1);
    });

    it('reverse posts a second journal; a second reversal of the same journal is refused', async () => {
      const { service, journalCount } = await make();
      const posted = await service.post(draft());
      const reversal = await service.reverse(posted.journalId, 'Voided');
      expect(reversal.journalId).not.toBe(posted.journalId);
      expect(await journalCount()).toBe(2);
      expect(await refusal(service.reverse(posted.journalId, 'Again'))).toEqual({
        code: 'CONFLICT',
        field: 'journal.already_reversed',
      });
    });
  });
}
