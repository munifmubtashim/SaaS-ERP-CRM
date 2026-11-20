import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AppError } from './AppError.js';
import {
  addMoney,
  allocate,
  allocateEvenly,
  applyRate,
  compareMoney,
  computeVat,
  formatMoney,
  formatMoneyBDT,
  isNegative,
  isZero,
  multiplyByQuantity,
  negateMoney,
  parseMoney,
  parseRatePercent,
  subtractMoney,
  sumMoney,
  ZERO,
  type Paisa,
} from './money.js';

// Test-side oracle: bigint paisa -> canonical money string, written independently of money.ts.
const MAX = 10n ** 18n - 1n; // numeric(18,2): 9999999999999999.99
function oracle(p: bigint): string {
  const abs = p < 0n ? -p : p;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return p < 0n ? `-${text}` : text;
}
const m = (s: string): Paisa => parseMoney(s);
const f = (p: Paisa): string => formatMoney(p);
const paisaIn = (min: bigint, max: bigint) => fc.bigInt({ min, max }).map((b) => m(oracle(b)));

function expectMoneyError(run: () => unknown, fieldCode: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  const error = caught as AppError;
  expect(error.code).toBe('VALIDATION_FAILED');
  expect(error.fields.map((field) => field.code)).toEqual([fieldCode]);
}

describe('parseMoney and formatMoney', () => {
  it('round-trips every canonical money string (property)', () => {
    fc.assert(fc.property(fc.bigInt({ min: -MAX, max: MAX }), (b) => f(m(oracle(b))) === oracle(b)));
  });

  it('returns a bigint, never a number (property)', () => {
    fc.assert(fc.property(fc.bigInt({ min: -MAX, max: MAX }), (b) => typeof m(oracle(b)) === 'bigint'));
  });

  it('normalises leading zeros and never prints -0.00', () => {
    expect(f(m('007.50'))).toBe('7.50');
    expect(f(m('-0.00'))).toBe('0.00');
  });

  it('accepts the largest and smallest numeric(18,2) values', () => {
    expect(f(m('9999999999999999.99'))).toBe('9999999999999999.99');
    expect(f(m('-9999999999999999.99'))).toBe('-9999999999999999.99');
  });

  it('refuses malformed strings', () => {
    for (const bad of [
      '12500',
      '12500.5',
      '12500.000',
      '1,250.00',
      ' 1.00',
      '+1.00',
      '10000000000000000.00',
      '',
    ])
      expectMoneyError(() => m(bad), 'money.invalid_format');
  });

  it('refuses a number (the float guard)', () => {
    expectMoneyError(() => parseMoney(12500 as unknown as string), 'money.not_a_string');
    expectMoneyError(() => parseMoney(0.1 as unknown as string), 'money.not_a_string');
  });
});

describe('addMoney, subtractMoney, sumMoney, negateMoney', () => {
  const HALF = MAX / 2n;

  it('subtract undoes add (property)', () => {
    fc.assert(
      fc.property(
        paisaIn(-HALF, HALF),
        paisaIn(-HALF, HALF),
        (a, b) => subtractMoney(addMoney(a, b), b) === a,
      ),
    );
  });

  it('add undoes subtract (property)', () => {
    fc.assert(
      fc.property(
        paisaIn(-HALF, HALF),
        paisaIn(-HALF, HALF),
        (a, b) => addMoney(subtractMoney(a, b), b) === a,
      ),
    );
  });

  it('adds exactly where floats would not', () => {
    expect(f(addMoney(m('0.10'), m('0.20')))).toBe('0.30');
    expect(f(sumMoney([m('0.10'), m('0.20'), m('-0.30')]))).toBe('0.00');
    expect(f(sumMoney([]))).toBe('0.00');
  });

  it('refuses a result beyond numeric(18,2), in both directions', () => {
    expectMoneyError(() => addMoney(m('9999999999999999.99'), m('0.01')), 'money.out_of_range');
    expectMoneyError(() => subtractMoney(m('-9999999999999999.99'), m('0.01')), 'money.out_of_range');
    expectMoneyError(() => sumMoney([m('9999999999999999.99'), m('0.01')]), 'money.out_of_range');
  });

  it('negates without producing -0.00', () => {
    expect(f(negateMoney(m('12.34')))).toBe('-12.34');
    expect(f(negateMoney(ZERO))).toBe('0.00');
  });
});

describe('rounding: half away from zero, applied once per multiplication', () => {
  // 0.01 x quantity: the exact result is in tenths of a paisa.
  it.each([
    ['0.01', '0.499', '0.00'], // 0.00499 below the half
    ['0.01', '0.500', '0.01'], // 0.005 exactly half -> away from zero
    ['0.01', '0.501', '0.01'], // above the half
    ['-0.01', '0.499', '0.00'], // never -0.00
    ['-0.01', '0.500', '-0.01'],
    ['-0.01', '0.501', '-0.01'],
    ['0.01', '-0.500', '-0.01'], // a negative quantity rounds the same way
  ])('multiplyByQuantity(%s, %s) = %s', (amount, qty, expected) => {
    expect(f(multiplyByQuantity(m(amount), qty))).toBe(expected);
  });

  // 0.01 x rate: the exact result is in hundredths of a paisa (0.0049999 needs this precision).
  it.each([
    ['0.01', '49.99', '0.00'], // 0.004999
    ['0.01', '50', '0.01'], // 0.005
    ['0.01', '50.01', '0.01'], // 0.005001
    ['-0.01', '49.99', '0.00'],
    ['-0.01', '50', '-0.01'],
    ['-0.01', '50.01', '-0.01'],
    ['9.99', '15', '1.50'], // 1.4985
    ['-9.99', '15', '-1.50'],
    ['0.03', '15', '0.00'], // 0.0045
  ])('applyRate(%s, %s%%) = %s', (amount, rate, expected) => {
    expect(f(applyRate(m(amount), parseRatePercent(rate)))).toBe(expected);
  });

  it('multiplies exactly when no rounding is needed', () => {
    expect(f(multiplyByQuantity(m('12500.00'), '3'))).toBe('37500.00');
    expect(f(multiplyByQuantity(m('199.99'), '1.5'))).toBe('299.99'); // 299.985 -> 299.99
  });

  it('is symmetric: f(-p) = -f(p) (property)', () => {
    const amount = paisaIn(-(10n ** 15n), 10n ** 15n);
    const qty = fc.integer({ min: 0, max: 999_999 }).map((n) => (n / 1000).toFixed(3));
    const rate = fc.integer({ min: 0, max: 10_000 }).map((bp) => (bp / 100).toFixed(2));
    fc.assert(
      fc.property(amount, qty, rate, (p, q, r) => {
        const bp = parseRatePercent(r);
        return (
          multiplyByQuantity(negateMoney(p), q) === negateMoney(multiplyByQuantity(p, q)) &&
          applyRate(negateMoney(p), bp) === negateMoney(applyRate(p, bp))
        );
      }),
    );
  });

  it('refuses a product beyond numeric(18,2)', () => {
    expectMoneyError(() => multiplyByQuantity(m('9999999999999999.99'), '2'), 'money.out_of_range');
  });

  it('refuses a bad quantity', () => {
    for (const bad of ['1.5000', '1,5', 'abc', '', '1e3'])
      expectMoneyError(() => multiplyByQuantity(m('1.00'), bad), 'money.invalid_quantity');
    expectMoneyError(() => multiplyByQuantity(m('1.00'), 2 as unknown as string), 'money.not_a_string');
  });
});

describe('parseRatePercent: a percent string, up to two decimals, to basis points', () => {
  it.each([
    ['15', 1500n],
    ['7.5', 750n],
    ['7.50', 750n],
    ['0', 0n],
    ['100', 10_000n],
    ['0.15', 15n], // a valid 0.15 percent; cannot be told apart from a mistyped 15 percent (plan section 5)
  ])('%s%% = %s basis points', (rate, bp) => {
    expect(parseRatePercent(rate)).toBe(bp);
  });

  it('refuses rates outside 0 to 100, extra decimals and symbols', () => {
    for (const bad of ['100.01', '-5', '15.005', '15%', '', '1000'])
      expectMoneyError(() => parseRatePercent(bad), 'money.invalid_rate');
    expectMoneyError(() => parseRatePercent(15 as unknown as string), 'money.not_a_string');
  });
});

describe('computeVat: per line (option A)', () => {
  const rate15 = () => parseRatePercent('15');

  it('rounds each line, and the total is the sum of the lines (worked example, plan section 6)', () => {
    const lines = [10.03, 10.03, 10.03].map(() => ({ net: m('10.03'), rate: rate15() }));
    const vat = computeVat(lines);
    expect(vat.lineVat.map(f)).toEqual(['1.50', '1.50', '1.50']);
    expect(f(vat.total)).toBe('4.50');
  });

  it('handles mixed rates, a zero rate and a returned line', () => {
    const vat = computeVat([
      { net: m('1000.00'), rate: rate15() },
      { net: m('200.00'), rate: parseRatePercent('7.5') },
      { net: m('50.00'), rate: parseRatePercent('0') },
      { net: m('-100.00'), rate: rate15() },
    ]);
    expect(vat.lineVat.map(f)).toEqual(['150.00', '15.00', '0.00', '-15.00']);
    expect(f(vat.total)).toBe('150.00');
  });

  it('returns zero for no lines', () => {
    const vat = computeVat([]);
    expect(vat.lineVat).toEqual([]);
    expect(f(vat.total)).toBe('0.00');
  });

  it('total always equals the sum of the line VAT (property)', () => {
    const line = fc.record({
      net: paisaIn(-(10n ** 12n), 10n ** 12n),
      rate: fc.integer({ min: 0, max: 10_000 }).map((bp) => parseRatePercent((bp / 100).toFixed(2))),
    });
    fc.assert(
      fc.property(fc.array(line, { maxLength: 50 }), (lines) => {
        const vat = computeVat(lines);
        return vat.lineVat.length === lines.length && sumMoney(vat.lineVat) === vat.total;
      }),
    );
  });
});

describe('allocate: largest remainder, ties to the earlier part', () => {
  it('always sums back to the total, each part within one paisa of its exact share (property)', () => {
    const total = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
    const weights = fc.array(fc.bigInt({ min: 0n, max: 10n ** 9n }), { minLength: 1, maxLength: 20 });
    fc.assert(
      fc.property(total, weights, (t, w) => {
        fc.pre(w.some((x) => x > 0n));
        const parts = allocate(
          m(oracle(t)),
          w.map((x) => m(oracle(x))),
        );
        const sum = w.reduce((a, b) => a + b, 0n);
        const allBigint = parts.every((p) => typeof p === 'bigint');
        const exactSum = parts.reduce<bigint>((a, b) => a + b, 0n) === t;
        // |part - t*w/sum| < 1 paisa  <=>  |part*sum - t*w| < sum
        const withinOne = parts.every((p, i) => {
          const diff = p * sum - t * (w[i] ?? 0n);
          return (diff < 0n ? -diff : diff) < sum;
        });
        return parts.length === w.length && allBigint && exactSum && withinOne;
      }),
    );
  });

  it('gives the leftover paisa to the largest remainders', () => {
    // 0.10 by 1:2:3 -> exact 1.67, 3.33, 5.00 paisa -> floors 1, 3, 5; the leftover goes to the 0.67
    expect(allocate(m('0.10'), [m('0.01'), m('0.02'), m('0.03')]).map(f)).toEqual(['0.02', '0.03', '0.05']);
  });

  it('breaks ties toward the earlier part', () => {
    expect(allocateEvenly(m('100.00'), 3).map(f)).toEqual(['33.34', '33.33', '33.33']);
    expect(allocateEvenly(m('0.02'), 3).map(f)).toEqual(['0.01', '0.01', '0.00']);
  });

  it('mirrors a negative total exactly', () => {
    expect(allocateEvenly(m('-100.00'), 3).map(f)).toEqual(['-33.34', '-33.33', '-33.33']);
  });

  it('gives a zero weight nothing', () => {
    expect(allocate(m('0.10'), [ZERO, m('0.01')]).map(f)).toEqual(['0.00', '0.10']);
  });

  it('refuses empty, all-zero or negative weights, and fewer than one part', () => {
    expectMoneyError(() => allocate(m('1.00'), []), 'money.invalid_weights');
    expectMoneyError(() => allocate(m('1.00'), [ZERO, ZERO]), 'money.invalid_weights');
    expectMoneyError(() => allocate(m('1.00'), [m('1.00'), m('-0.01')]), 'money.invalid_weights');
    expectMoneyError(() => allocateEvenly(m('1.00'), 0), 'money.invalid_weights');
  });
});

describe('compare and tests', () => {
  it('orders amounts', () => {
    expect(compareMoney(m('1.00'), m('2.00'))).toBe(-1);
    expect(compareMoney(m('2.00'), m('2.00'))).toBe(0);
    expect(compareMoney(m('-2.00'), m('-3.00'))).toBe(1);
  });

  it('knows zero and negative', () => {
    expect(isZero(ZERO)).toBe(true);
    expect(isZero(m('-0.00'))).toBe(true);
    expect(isNegative(m('-0.01'))).toBe(true);
    expect(isNegative(ZERO)).toBe(false);
  });
});

describe('formatMoneyBDT errors', () => {
  it('throws AppError, not a plain Error, for a malformed amount', () => {
    expectMoneyError(() => formatMoneyBDT('12.5'), 'money.invalid_format');
  });
});
