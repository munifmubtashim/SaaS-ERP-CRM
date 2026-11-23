import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatQuantityBD, quantitySchema } from './quantity.js';

/** Quantities are numeric(18,3) in the database and a three-decimal string in the API (CLAUDE.md). */
describe('quantitySchema', () => {
  it('accepts a string with exactly three decimals, negative included (a stock movement out)', () => {
    for (const q of ['0.000', '3.000', '1.500', '-2.000', '999999999999999.999']) {
      expect(quantitySchema.safeParse(q).success, q).toBe(true);
    }
  });

  it('refuses a number, other decimal counts, 16 whole digits, separators and spaces', () => {
    for (const q of [3, '3', '3.0', '3.0000', '1000000000000000.000', '1,000.000', ' 1.000', '+1.000']) {
      expect(quantitySchema.safeParse(q).success, String(q)).toBe(false);
    }
  });
});

describe('formatQuantityBD', () => {
  it('drops trailing zeros, and the point with them for whole quantities', () => {
    expect(formatQuantityBD('3.000')).toBe('3');
    expect(formatQuantityBD('1.500')).toBe('1.5');
    expect(formatQuantityBD('0.125')).toBe('0.125');
    expect(formatQuantityBD('0.000')).toBe('0');
  });

  it('groups thousands as lakh and crore, and keeps the sign', () => {
    expect(formatQuantityBD('1234567.250')).toBe('12,34,567.25');
    expect(formatQuantityBD('-1500.000')).toBe('-1,500');
  });

  it('prints Bangla digits for bn-BD', () => {
    expect(formatQuantityBD('1234.500', 'bn-BD')).toBe('১,২৩৪.৫');
  });

  it('never loses a digit: removing the commas gives the trimmed input back (property)', () => {
    const quantity = fc
      .tuple(fc.boolean(), fc.bigInt({ min: 0n, max: 10n ** 15n - 1n }), fc.integer({ min: 0, max: 999 }))
      .map(
        ([neg, whole, frac]) =>
          `${neg && (whole > 0n || frac > 0) ? '-' : ''}${whole}.${String(frac).padStart(3, '0')}`,
      );
    fc.assert(
      fc.property(quantity, (q) => {
        const trimmed = q.replace(/\.?0+$/, '');
        return formatQuantityBD(q).replace(/,/g, '') === trimmed;
      }),
    );
  });

  it('refuses what is not a quantity string', () => {
    expect(() => formatQuantityBD('3')).toThrow();
  });
});
