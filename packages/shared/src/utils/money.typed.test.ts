import { describe, expect, it } from 'vitest';
import { moneyFromTyped, moneySchema } from './money.js';

/** What a person types in an amount box, as the API's money string. Text only: no arithmetic on money. */
describe('moneyFromTyped', () => {
  it('adds the missing decimals', () => {
    expect(moneyFromTyped('1850')).toBe('1850.00');
    expect(moneyFromTyped('1850.5')).toBe('1850.50');
    expect(moneyFromTyped('1850.75')).toBe('1850.75');
  });

  it('drops grouping commas and spaces, lakh style included', () => {
    expect(moneyFromTyped(' 2,45,000 ')).toBe('245000.00');
    expect(moneyFromTyped('1 850')).toBe('1850.00');
  });

  it('leaves anything else as typed, so the schema refuses it', () => {
    for (const typed of ['', 'abc', '12.345', '-5', '1e3']) {
      expect(moneySchema.refine((m) => !m.startsWith('-')).safeParse(moneyFromTyped(typed)).success).toBe(
        false,
      );
    }
  });
});
