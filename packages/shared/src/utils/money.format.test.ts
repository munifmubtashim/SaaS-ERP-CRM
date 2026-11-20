import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AppError } from './AppError.js';
import { formatMoneyBDT } from './money.js';

/**
 * formatMoneyBDT: display only, lakh/crore grouping (spec C-09), English or Bangla digits. It must never lose
 * a digit, since amounts reach numeric(18,2) (16 whole digits), beyond what a float holds exactly.
 */

// Independent oracle: bigint paisa -> canonical money string (no leading zeros, never "-0.00").
const MAX = 10n ** 18n - 1n;
function canonical(p: bigint): string {
  const abs = p < 0n ? -p : p;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return p < 0n ? `-${text}` : text;
}
const amount = fc.bigInt({ min: -MAX, max: MAX }).map(canonical);

/** Indian grouping: the last three whole digits, then pairs. */
const EN_GROUPED = /^-?(\d{1,3}|\d{1,2}(,\d{2})*,\d{3})\.\d{2}$/;
const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAsciiDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(BANGLA_DIGITS.indexOf(c)));

describe('formatMoneyBDT, English', () => {
  it('gives back the exact amount once the commas are removed (property)', () => {
    fc.assert(fc.property(amount, (a) => formatMoneyBDT(a).replace(/,/g, '') === a));
  });

  it('groups as lakh and crore: three digits, then pairs (property)', () => {
    fc.assert(fc.property(amount, (a) => EN_GROUPED.test(formatMoneyBDT(a))));
  });

  it('puts the first comma at one thousand and the second at one lakh', () => {
    expect(formatMoneyBDT('999.99')).toBe('999.99');
    expect(formatMoneyBDT('1000.00')).toBe('1,000.00');
    expect(formatMoneyBDT('99999.00')).toBe('99,999.00');
    expect(formatMoneyBDT('100000.00')).toBe('1,00,000.00');
    expect(formatMoneyBDT('10000000.00')).toBe('1,00,00,000.00');
  });

  it('keeps every digit of the largest numeric(18,2) amount', () => {
    expect(formatMoneyBDT('9999999999999999.99')).toBe('9,99,99,99,99,99,99,999.99');
    expect(formatMoneyBDT('-9999999999999999.99')).toBe('-9,99,99,99,99,99,99,999.99');
  });

  it('drops leading zeros in the whole part and keeps both paisa digits', () => {
    expect(formatMoneyBDT('0007.05')).toBe('7.05');
    expect(formatMoneyBDT('0.00')).toBe('0.00');
    expect(formatMoneyBDT('0.50')).toBe('0.50');
  });
});

describe('formatMoneyBDT, Bangla', () => {
  it('is the English output with Bangla digits, and no ASCII digit left (property)', () => {
    fc.assert(
      fc.property(amount, (a) => {
        const bn = formatMoneyBDT(a, 'bn-BD');
        return !/[0-9]/.test(bn) && toAsciiDigits(bn) === formatMoneyBDT(a);
      }),
    );
  });

  it('pads single-digit paisa with a Bangla zero', () => {
    expect(formatMoneyBDT('1234567.05', 'bn-BD')).toBe('১২,৩৪,৫৬৭.০৫');
    expect(formatMoneyBDT('0.00', 'bn-BD')).toBe('০.০০');
  });
});

describe('formatMoneyBDT refuses what is not a money string', () => {
  function fieldCode(run: () => unknown): string | undefined {
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      return (error as AppError).fields[0]?.code;
    }
    return undefined;
  }

  it('refuses a number, even a whole one (the float guard)', () => {
    expect(fieldCode(() => formatMoneyBDT(12500 as unknown as string))).toBe('money.not_a_string');
  });

  it('refuses a wrong number of decimals, separators, symbols, spaces and 17 whole digits', () => {
    for (const bad of [
      '12',
      '12.5',
      '12.345',
      '1,000.00',
      '৳100.00',
      ' 1.00',
      '+1.00',
      '1e3.00',
      '10000000000000000.00',
    ]) {
      expect(
        fieldCode(() => formatMoneyBDT(bad)),
        bad,
      ).toBe('money.invalid_format');
    }
  });

  it('refuses Bangla digits as input: input is always ASCII', () => {
    expect(fieldCode(() => formatMoneyBDT('১০০.০০'))).toBe('money.invalid_format');
  });
});
