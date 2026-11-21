import { AppError, parseMoney } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { BaseDTO } from '../dto/BaseDTO.js';
import { Prisma } from '../generated/prisma/client.js';

/** Exposes the protected static helpers, the way a module DTO's `fromRow` calls them. */
class SampleDTO extends BaseDTO {
  static money(value: Prisma.Decimal | null): string | null {
    return BaseDTO.moneyFromDecimal(value);
  }

  static quantity(value: Prisma.Decimal | null): string | null {
    return BaseDTO.quantityFromDecimal(value);
  }
}

const decimal = (text: string) => new Prisma.Decimal(text);

describe('BaseDTO money and quantity helpers (A10a)', () => {
  it('reads money with two decimals that parseMoney accepts: "12500.00" and "0.00" round-trip', () => {
    for (const text of ['12500.00', '0.00']) {
      const money = SampleDTO.money(decimal(text));
      expect(money).toBe(text);
      expect(parseMoney(money as string)).toBe(parseMoney(text));
    }
  });

  it('adds the trailing zeros that Decimal.toString() drops: 12500 becomes "12500.00"', () => {
    // The bug this guards against: Decimal('12500.00').toString() is "12500", which parseMoney refuses.
    expect(decimal('12500.00').toString()).toBe('12500');
    expect(SampleDTO.money(decimal('12500'))).toBe('12500.00');
  });

  it('keeps the sign of a negative amount: "-350.50" round-trips through parseMoney', () => {
    const money = SampleDTO.money(decimal('-350.50'));
    expect(money).toBe('-350.50');
    expect(parseMoney(money as string)).toBe(-35_050n);
  });

  it('reads a quantity with three decimals: 1.5 becomes "1.500"', () => {
    expect(SampleDTO.quantity(decimal('1.5'))).toBe('1.500');
  });

  it('passes null through for a nullable column', () => {
    expect(SampleDTO.money(null)).toBeNull();
    expect(SampleDTO.quantity(null)).toBeNull();
  });

  it('throws on more decimals than the column scale, and never rounds', () => {
    // A numeric(18,2) or numeric(18,3) column cannot hold these, so they mean a wrong column was mapped.
    for (const read of [
      () => SampleDTO.money(decimal('1.005')),
      () => SampleDTO.quantity(decimal('1.0005')),
    ]) {
      expect(read).toThrow(AppError);
      expect(read).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
    }
  });
});
