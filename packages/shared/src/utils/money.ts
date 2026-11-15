import { z } from 'zod';

/**
 * Money rules (roadmap 4.3, appendix C): numeric(18,2) in the database, a string in the API,
 * never a JavaScript float. All money arithmetic goes through this module.
 * TODO(Munif, Phase 1): add decimal arithmetic (integer paisa or a decimal library) with property tests.
 */
export const MONEY_PATTERN = /^-?\d{1,16}\.\d{2}$/;

/** Zod schema for a money amount in an API payload, e.g. "12500.00". */
export const moneySchema = z.string().regex(MONEY_PATTERN, 'Money must be a string with two decimals');

/** Formats a money string with lakh/crore grouping for display, e.g. "1234567.50" -> "12,34,567.50". */
export function formatMoneyBDT(amount: string, locale: 'en-BD' | 'bn-BD' = 'en-BD'): string {
  if (!MONEY_PATTERN.test(amount)) throw new Error(`Not a money string: ${amount}`);
  const negative = amount.startsWith('-');
  const [whole = '0', paisa = '00'] = amount.replace('-', '').split('.');
  // BigInt keeps every digit exact: no float conversion anywhere.
  const grouped = new Intl.NumberFormat(locale === 'bn-BD' ? 'bn-BD' : 'en-IN').format(BigInt(whole));
  const decimals =
    locale === 'bn-BD' ? new Intl.NumberFormat('bn-BD').format(BigInt(paisa)).padStart(2, '০') : paisa;
  return `${negative ? '-' : ''}${grouped}.${decimals}`;
}
