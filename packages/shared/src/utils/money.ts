import { z } from 'zod';
import { AppError } from './AppError.js';

/**
 * Money rules (roadmap 4.3, appendix C): numeric(18,2) in the database, a string in the API ("12500.00"),
 * never a JavaScript float. All money arithmetic goes through this module.
 *
 * Inside the code an amount is `Paisa`: a bigint count of paisa (1 taka = 100 paisa). Nothing here ever
 * produces a `number`. Every result is checked against the numeric(18,2) range, +/-(10^18 - 1) paisa.
 * Rounding happens in exactly one place, `divideRounded`, and only when multiplying (by a quantity or a
 * rate). Adding, subtracting and allocating are exact.
 */
export const MONEY_PATTERN = /^-?\d{1,16}\.\d{2}$/;

/** Zod schema for a money amount in an API payload, e.g. "12500.00". */
export const moneySchema = z.string().regex(MONEY_PATTERN, 'Money must be a string with two decimals');

declare const paisaBrand: unique symbol;
/** An amount in paisa. Made only by this module, so a plain number or bigint cannot be passed by mistake. */
export type Paisa = bigint & { readonly [paisaBrand]: true };

declare const basisPointsBrand: unique symbol;
/** A rate in basis points: 15% = 1500. Made only by `parseRatePercent`. */
export type BasisPoints = bigint & { readonly [basisPointsBrand]: true };

const MAX_PAISA = 10n ** 18n - 1n;
const QUANTITY_PATTERN = /^(-?)(\d{1,15})(?:\.(\d{1,3}))?$/;
const RATE_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;
const MAX_RATE_BP = 10_000n;

export const ZERO = 0n as Paisa;

function moneyError(code: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', message, [{ path: '', code, message }]);
}

function requireString(value: unknown): string {
  if (typeof value !== 'string')
    throw moneyError('money.not_a_string', 'Amounts must be strings, never numbers');
  return value;
}

function inRange(value: bigint): Paisa {
  if (value > MAX_PAISA || value < -MAX_PAISA)
    throw moneyError('money.out_of_range', 'Amount is outside the numeric(18,2) range');
  return value as Paisa;
}

/**
 * The only rounding in the money code: numerator / denominator, rounded half away from zero
 * (0.005 -> 0.01, -0.005 -> -0.01). Same rule as PostgreSQL's round(numeric), and symmetric, so a
 * reversal is exactly the negative of the original. `denominator` is always positive.
 */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const magnitude = numerator < 0n ? -numerator : numerator;
  let quotient = magnitude / denominator;
  if ((magnitude % denominator) * 2n >= denominator) quotient += 1n;
  return numerator < 0n ? -quotient : quotient;
}

/** "12500.00" -> Paisa. Accepts exactly what `moneySchema` accepts. */
export function parseMoney(amount: string): Paisa {
  const text = requireString(amount);
  if (!MONEY_PATTERN.test(text)) throw moneyError('money.invalid_format', `Not a money string: ${text}`);
  const negative = text.startsWith('-');
  const [whole = '0', fraction = '00'] = text.replace('-', '').split('.');
  const magnitude = BigInt(whole) * 100n + BigInt(fraction);
  return inRange(negative ? -magnitude : magnitude);
}

/** Paisa -> "12500.00". Canonical: no leading zeros, never "-0.00". */
export function formatMoney(amount: Paisa): string {
  const magnitude = amount < 0n ? -amount : amount;
  const text = `${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
  return amount < 0n ? `-${text}` : text;
}

export function addMoney(a: Paisa, b: Paisa): Paisa {
  return inRange(a + b);
}

export function subtractMoney(a: Paisa, b: Paisa): Paisa {
  return inRange(a - b);
}

export function sumMoney(amounts: readonly Paisa[]): Paisa {
  return inRange(amounts.reduce<bigint>((total, amount) => total + amount, 0n));
}

export function negateMoney(amount: Paisa): Paisa {
  return inRange(-amount);
}

/** amount x quantity, the quantity a numeric(18,3) string such as "1.500". Rounded once, to paisa. */
export function multiplyByQuantity(amount: Paisa, quantity: string): Paisa {
  const match = QUANTITY_PATTERN.exec(requireString(quantity));
  if (!match) throw moneyError('money.invalid_quantity', `Not a quantity with up to 3 decimals: ${quantity}`);
  const [, sign, whole = '0', fraction = ''] = match;
  const thousandths = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return inRange(divideRounded(amount * (sign === '-' ? -thousandths : thousandths), 1000n));
}

/**
 * A percent string with up to two decimals ("15", "7.5", "7.50"), 0 to 100, to basis points (15 -> 1500).
 * "0.15" is a valid 0.15 percent; a mistyped 15 percent cannot be told apart here, so rates are entered
 * once, on the tax-rate setup screen labelled "Rate (%)", and chosen by id everywhere else.
 */
export function parseRatePercent(rate: string): BasisPoints {
  const match = RATE_PATTERN.exec(requireString(rate));
  const basisPoints = match ? BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : -1n;
  if (basisPoints < 0n || basisPoints > MAX_RATE_BP)
    throw moneyError('money.invalid_rate', `Not a percent from 0 to 100 with up to 2 decimals: ${rate}`);
  return basisPoints as BasisPoints;
}

/** amount x rate. Rounded once, to paisa. */
export function applyRate(amount: Paisa, rate: BasisPoints): Paisa {
  return inRange(divideRounded(amount * rate, 10_000n));
}

export interface VatLine {
  net: Paisa;
  rate: BasisPoints;
}

/**
 * VAT for an invoice. Rule in use: **per line (option A)**: each line's VAT is rounded on its own, and the
 * total is the sum of the printed lines. This is the shape the roadmap suggests (a tax rate per invoice
 * line, "line VAT" on the Mushak 6.3 print), but no source states the rule: open question for Farhan and
 * MotoMart's accountant (A8 plan, section 6). This function is the only place the rule lives.
 *
 * Option B, per invoice, if the accountant asks for it: group the lines by rate; for each rate, round
 * applyRate(sum of nets) once; then split that VAT back across the rate's lines with
 * allocate(groupVat, nets), so the printed line VAT still sums exactly to the total.
 *
 * Worked example, three lines of 10.03 at 15% (exact VAT 1.5045 each, 4.5135 in all):
 *   A, per line:    1.50 + 1.50 + 1.50 = 4.50
 *   B, per invoice: round(30.09 x 15%) = 4.51, allocated 1.51 + 1.50 + 1.50
 */
export function computeVat(lines: readonly VatLine[]): { lineVat: Paisa[]; total: Paisa } {
  const lineVat = lines.map((line) => applyRate(line.net, line.rate));
  return { lineVat, total: sumMoney(lineVat) };
}

/**
 * Splits `total` in proportion to `weights` so the parts always sum exactly to the total. Largest
 * remainder: each part gets the rounded-down share, then the leftover paisa (fewer than the number of
 * parts) go one each to the parts with the largest remainders; a tie goes to the earlier part. Every part
 * is within one paisa of its exact share. A negative total is split as its positive value, then negated.
 */
export function allocate(total: Paisa, weights: readonly Paisa[]): Paisa[] {
  const weightSum = weights.reduce<bigint>((sum, weight) => sum + weight, 0n);
  if (weights.length === 0 || weights.some((weight) => weight < 0n) || weightSum === 0n)
    throw moneyError('money.invalid_weights', 'Weights must be zero or more, with at least one above zero');
  const magnitude = total < 0n ? -total : total;
  const parts = weights.map((weight) => (magnitude * weight) / weightSum);
  const remainders = weights.map((weight) => (magnitude * weight) % weightSum);
  let leftover = magnitude - parts.reduce((sum, part) => sum + part, 0n);
  const order = weights
    .map((_, index) => index)
    .sort((a, b) => {
      const ra = remainders[a] ?? 0n;
      const rb = remainders[b] ?? 0n;
      return ra === rb ? a - b : ra > rb ? -1 : 1;
    });
  for (const index of order) {
    if (leftover === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return parts.map((part) => inRange(total < 0n ? -part : part));
}

/** Splits `total` into `count` equal parts; the first parts carry the leftover paisa. */
export function allocateEvenly(total: Paisa, count: number): Paisa[] {
  if (!Number.isInteger(count) || count < 1)
    throw moneyError('money.invalid_weights', 'The number of parts must be a whole number of at least 1');
  return allocate(
    total,
    Array.from({ length: count }, () => 1n as Paisa),
  );
}

export function compareMoney(a: Paisa, b: Paisa): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isZero(amount: Paisa): boolean {
  return amount === 0n;
}

export function isNegative(amount: Paisa): boolean {
  return amount < 0n;
}

/** Formats a money string with lakh/crore grouping for display, e.g. "1234567.50" -> "12,34,567.50". */
export function formatMoneyBDT(amount: string, locale: 'en-BD' | 'bn-BD' = 'en-BD'): string {
  const text = requireString(amount);
  if (!MONEY_PATTERN.test(text)) throw moneyError('money.invalid_format', `Not a money string: ${text}`);
  const negative = text.startsWith('-');
  const [whole = '0', paisa = '00'] = text.replace('-', '').split('.');
  // BigInt keeps every digit exact: no float conversion anywhere.
  const grouped = new Intl.NumberFormat(locale === 'bn-BD' ? 'bn-BD' : 'en-IN').format(BigInt(whole));
  const decimals =
    locale === 'bn-BD' ? new Intl.NumberFormat('bn-BD').format(BigInt(paisa)).padStart(2, '০') : paisa;
  return `${negative ? '-' : ''}${grouped}.${decimals}`;
}

/**
 * `part` as a share of `whole`, in basis points (35.15% -> 3515), rounded half away from zero. For dashboard
 * percents: of a target, a margin, a share. It can pass 10,000 (over target) and be negative (a loss margin).
 */
export function ratioBasisPoints(part: Paisa, whole: Paisa): bigint {
  if (whole <= 0n) throw moneyError('money.zero_whole', 'A percent needs a whole above zero');
  return divideRounded(part * 10_000n, whole);
}

/** amount x numerator / denominator, rounded once to paisa: a pace or a projection over days. */
export function prorate(amount: Paisa, numerator: bigint, denominator: bigint): Paisa {
  if (denominator <= 0n)
    throw moneyError('money.zero_denominator', 'Pro-rating needs a denominator above zero');
  return inRange(divideRounded(amount * numerator, denominator));
}

/** Basis points as a display percent ("35.2%"), with `decimals` places, in English or Bangla digits. */
export function formatPercent(
  basisPoints: bigint,
  locale: 'en-BD' | 'bn-BD' = 'en-BD',
  decimals: 0 | 1 = 1,
): string {
  const scaled = divideRounded(basisPoints, decimals === 1 ? 10n : 100n);
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const text = decimals === 1 ? `${magnitude / 10n}.${magnitude % 10n}` : `${magnitude}`;
  const digits = locale === 'bn-BD' ? text.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d) : text;
  return `${negative ? '-' : ''}${digits}%`;
}
