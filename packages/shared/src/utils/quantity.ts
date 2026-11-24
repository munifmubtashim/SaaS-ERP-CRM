import { z } from 'zod';
import { AppError } from './AppError.js';

/**
 * Quantities (CLAUDE.md conventions): numeric(18,3) in the database, a string with exactly three decimals in
 * the API ("12.000"), never a JavaScript float. Same reasons as money: no float rounding, every digit kept.
 */
export const QUANTITY_PATTERN = /^-?\d{1,15}\.\d{3}$/;

export const quantitySchema = z
  .string()
  .regex(QUANTITY_PATTERN, 'Quantity must be a string with three decimals');

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * Formats a quantity for display: trailing zeros dropped ("3.000" -> "3", "1.500" -> "1.5"), lakh/crore
 * grouping, Bangla digits with 'bn-BD'. Display only; never parse the result back.
 */
export function formatQuantityBD(quantity: string, locale: 'en-BD' | 'bn-BD' = 'en-BD'): string {
  if (!QUANTITY_PATTERN.test(quantity)) {
    const message = `Not a quantity string: ${quantity}`;
    throw new AppError('VALIDATION_FAILED', message, [
      { path: '', code: 'quantity.invalid_format', message },
    ]);
  }
  const negative = quantity.startsWith('-');
  const [whole = '0', fraction = '000'] = quantity.replace('-', '').split('.');
  // BigInt keeps every digit exact: no float conversion anywhere.
  const grouped = new Intl.NumberFormat(locale === 'bn-BD' ? 'bn-BD' : 'en-IN').format(BigInt(whole));
  const trimmed = fraction.replace(/0+$/, '');
  const decimals =
    locale === 'bn-BD' ? trimmed.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d) : trimmed;
  return `${negative ? '-' : ''}${grouped}${decimals ? `.${decimals}` : ''}`;
}
