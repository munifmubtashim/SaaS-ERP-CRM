import { AppError, compareMoney, isZero, parseMoney, sumMoney, ZERO, type Paisa } from '@erp/shared';
import type { JournalDraft } from './contracts/provided/IPostingService.js';

/**
 * The checks every IPostingService makes before any SQL (ADR 0012 section 2): at least two lines; each line has
 * exactly one side above zero and none below; debits equal credits, summed in paisa. A failure is a programming
 * error in the consumer, so it is 500 journal.unbalanced. The database checks balance again at commit (ADR 0013).
 */
export function assertBalancedDraft(draft: JournalDraft): void {
  if (draft.lines.length < 2) throw unbalanced('A journal needs at least two lines.');
  const debits: Paisa[] = [];
  const credits: Paisa[] = [];
  for (const line of draft.lines) {
    const debit = parseOrRefuse(line.debit);
    const credit = parseOrRefuse(line.credit);
    if (compareMoney(debit, ZERO) < 0 || compareMoney(credit, ZERO) < 0) {
      throw unbalanced('A journal line amount cannot be negative.');
    }
    if (isZero(debit) === isZero(credit))
      throw unbalanced('Each journal line has exactly one side above zero.');
    debits.push(debit);
    credits.push(credit);
  }
  if (compareMoney(sumMoney(debits), sumMoney(credits)) !== 0) throw unbalanced('Debits and credits differ.');
}

function parseOrRefuse(amount: string): Paisa {
  try {
    return parseMoney(amount);
  } catch {
    throw unbalanced(`Not a money amount: ${amount}`);
  }
}

function unbalanced(message: string): AppError {
  return new AppError('INTERNAL_ERROR', message, [{ path: 'lines', code: 'journal.unbalanced', message }]);
}
