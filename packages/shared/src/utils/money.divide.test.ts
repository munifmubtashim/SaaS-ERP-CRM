import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AppError } from './AppError.js';
import {
  divideByQuantity,
  formatMoney,
  multiplyByQuantity,
  negateMoney,
  parseMoney,
  type Paisa,
} from './money.js';

/**
 * divideByQuantity (ADR 0021 part 0): the weighted-average cost divides a total by a quantity. Rounded once, half
 * away from zero, to paisa, the same rule as multiplying.
 */
const div = (amount: string, quantity: string) => formatMoney(divideByQuantity(parseMoney(amount), quantity));

const thousandthsToQuantity = (t: bigint) => `${t / 1000n}.${(t % 1000n).toString().padStart(3, '0')}`;

describe('divideByQuantity', () => {
  it.each([
    ['100.00', '3.000', '33.33'],
    ['200.00', '3.000', '66.67'],
    ['0.05', '2.000', '0.03'],
    ['-0.05', '2.000', '-0.03'],
    ['10.00', '0.500', '20.00'],
    ['123456.78', '1.000', '123456.78'],
    ['134000.00', '1', '134000.00'],
    ['1.00', '3.5', '0.29'],
  ])('%s / %s = %s', (amount, quantity, expected) => {
    expect(div(amount, quantity)).toBe(expected);
  });

  it.each(['0.000', '0', '-1.000', '1.0000', 'abc', ''])('refuses the quantity %j', (quantity) => {
    expect(() => divideByQuantity(parseMoney('1.00'), quantity)).toThrow(AppError);
  });

  it('refuses a number, never coerces it', () => {
    expect(() => divideByQuantity(parseMoney('1.00'), 3 as unknown as string)).toThrow(AppError);
  });

  const amount = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }).map((p) => p as Paisa);
  const thousandths = fc.bigInt({ min: 1n, max: 10n ** 9n });

  it('the rounding error is at most half a paisa', () => {
    fc.assert(
      fc.property(amount, thousandths, (a, t) => {
        const q = divideByQuantity(a, thousandthsToQuantity(t));
        const error = q * t - a * 1000n;
        const absolute = error < 0n ? -error : error;
        expect(absolute * 2n <= t).toBe(true);
      }),
    );
  });

  it('is symmetric: dividing a negated amount gives the negated result', () => {
    fc.assert(
      fc.property(amount, thousandths, (a, t) => {
        const quantity = thousandthsToQuantity(t);
        expect(divideByQuantity(negateMoney(a), quantity)).toBe(negateMoney(divideByQuantity(a, quantity)));
      }),
    );
  });

  it('dividing then multiplying by a whole quantity returns the amount when it divides exactly', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        fc.integer({ min: 1, max: 1000 }),
        (p, n) => {
          const exact = (p * BigInt(n)) as Paisa;
          const quantity = `${n}.000`;
          expect(multiplyByQuantity(divideByQuantity(exact, quantity), quantity)).toBe(exact);
        },
      ),
    );
  });
});
