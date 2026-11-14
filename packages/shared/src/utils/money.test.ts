import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from '../schemas/error.schema.js';
import { ERROR_CODES } from '../schemas/error.schema.js';
import { ERROR_STATUS } from './AppError.js';
import { formatMoneyBDT, moneySchema } from './money.js';

describe('money helpers', () => {
  it('accepts money only as a string with two decimals', () => {
    expect(moneySchema.safeParse('12500.00').success).toBe(true);
    expect(moneySchema.safeParse(12500).success).toBe(false);
    expect(moneySchema.safeParse('12500.5').success).toBe(false);
  });

  it('groups in lakh and crore without losing digits', () => {
    expect(formatMoneyBDT('123456789012345.67')).toBe('12,34,56,78,90,12,345.67');
    expect(formatMoneyBDT('-1234567.50')).toBe('-12,34,567.50');
  });
});

describe('API error contract', () => {
  it('maps every error code to an HTTP error status', () => {
    for (const code of ERROR_CODES) expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
  });

  it('rejects an error body without a requestId', () => {
    expect(apiErrorSchema.safeParse({ code: 'NOT_FOUND', message: 'x', fields: [] }).success).toBe(false);
  });
});
