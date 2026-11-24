import { AppError, parseMoney } from '@erp/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { BaseDTO } from '../dto/BaseDTO.js';
import { Prisma } from '../generated/prisma/client.js';

/** Exposes the protected static helpers, the way a module DTO's `fromRow` calls them. */
class SampleDTO extends BaseDTO {
  /** A NOT NULL money column: the overload gives `string`, so no cast is needed. */
  static money(value: Prisma.Decimal): string {
    return BaseDTO.moneyFromDecimal(value);
  }

  static nullableMoney(value: Prisma.Decimal | null): string | null {
    return BaseDTO.moneyFromDecimal(value);
  }

  static quantity(value: Prisma.Decimal): string {
    return BaseDTO.quantityFromDecimal(value);
  }

  static nullableQuantity(value: Prisma.Decimal | null): string | null {
    return BaseDTO.quantityFromDecimal(value);
  }
}

/** The helpers' own overloads, unwrapped, for the type test. */
class BaseDTOTypes extends BaseDTO {
  static money = BaseDTO.moneyFromDecimal;
  static quantity = BaseDTO.quantityFromDecimal;
}

const decimal = (text: string) => new Prisma.Decimal(text);

describe('BaseDTO money and quantity helpers (A10a)', () => {
  it('reads money with two decimals that parseMoney accepts: "12500.00" and "0.00" round-trip', () => {
    for (const text of ['12500.00', '0.00']) {
      const money = SampleDTO.money(decimal(text));
      expect(money).toBe(text);
      expect(parseMoney(money)).toBe(parseMoney(text));
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
    expect(parseMoney(money)).toBe(-35_050n);
  });

  it('reads a quantity with three decimals: 1.5 becomes "1.500"', () => {
    expect(SampleDTO.quantity(decimal('1.5'))).toBe('1.500');
  });

  it('passes null through for a nullable column', () => {
    expect(SampleDTO.nullableMoney(null)).toBeNull();
    expect(SampleDTO.nullableQuantity(null)).toBeNull();
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

  it('throws on NaN and Infinity, which numeric can hold but money and quantities never are', () => {
    // PostgreSQL numeric accepts 'NaN', and 'Infinity' since version 14. decimalPlaces() of NaN is NaN, so the
    // scale check alone would let it through and return the string "NaN".
    for (const text of ['NaN', 'Infinity', '-Infinity']) {
      for (const read of [() => SampleDTO.money(decimal(text)), () => SampleDTO.quantity(decimal(text))]) {
        expect(read).toThrow(AppError);
        expect(read).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
      }
    }
  });

  it('types a NOT NULL column as string and a nullable one as string | null, so callers need no cast', () => {
    const notNull = decimal('1.00');
    const nullable = null as Prisma.Decimal | null;
    expectTypeOf(BaseDTOTypes.money(notNull)).toEqualTypeOf<string>();
    expectTypeOf(BaseDTOTypes.money(nullable)).toEqualTypeOf<string | null>();
    expectTypeOf(BaseDTOTypes.quantity(notNull)).toEqualTypeOf<string>();
    expectTypeOf(BaseDTOTypes.quantity(nullable)).toEqualTypeOf<string | null>();
  });
});
