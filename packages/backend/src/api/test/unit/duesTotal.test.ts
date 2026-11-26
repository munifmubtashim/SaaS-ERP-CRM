import { describe, expect, it } from 'vitest';
import { openDuesTotal } from '../duesTotal.js';

/**
 * The dues test's own sum (ADR 0059 test 1): the open invoices' dues added with the shared money helpers, never with
 * floats or hand-made arithmetic on the strings (CLAUDE.md). Each case below goes wrong with JavaScript numbers.
 */
const dues = (...due: string[]) => ({ openInvoices: due.map((d) => ({ due: d })) });

describe('openDuesTotal', () => {
  it('adds paisa exactly: 0.10 + 0.20 is 0.30 (as floats, 0.30000000000000004)', () => {
    expect(openDuesTotal(dues('0.10', '0.20'))).toBe('0.30');
  });

  it('keeps every paisa of a 16-digit amount (as floats, 99999999999999.98 + 0.01 is 100000000000000)', () => {
    expect(openDuesTotal(dues('99999999999999.98', '0.01'))).toBe('99999999999999.99');
  });

  it('answers the canonical money string: no open invoice is 0.00, and the scale is always two decimals', () => {
    expect(openDuesTotal(dues())).toBe('0.00');
    expect(openDuesTotal(dues('600.00', '2000.00'))).toBe('2600.00');
  });
});
