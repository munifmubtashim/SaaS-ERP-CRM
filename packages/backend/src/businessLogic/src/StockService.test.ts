import { describe, expect, it } from 'vitest';
import { weightedAverage } from './StockService.js';

/**
 * ADR 0021 section 2 and test 5: the weighted average, (on hand × average + quantity × unit cost) ÷ new on hand,
 * computed with the shared money helpers and rounded once, half away from zero, to paisa (divideByQuantity).
 */
describe('weightedAverage', () => {
  it('10 at ৳100.00, then 10 at ৳110.00, averages ৳105.00 (ADR 0021 test 5)', () => {
    expect(
      weightedAverage({
        onHand: '10.000',
        avgCost: '100.00',
        qty: '10.000',
        unitCost: '110.00',
        newOnHand: '20.000',
      }),
    ).toBe('105.00');
  });

  it('the first receipt sets the average to its own cost', () => {
    expect(
      weightedAverage({
        onHand: '0.000',
        avgCost: '0.00',
        qty: '4.000',
        unitCost: '640.00',
        newOnHand: '4.000',
      }),
    ).toBe('640.00');
  });

  it('an uneven result rounds once, half away from zero, to paisa', () => {
    // (1 × 100.00 + 2 × 100.01) ÷ 3 = 100.00666… → 100.01
    expect(
      weightedAverage({
        onHand: '1.000',
        avgCost: '100.00',
        qty: '2.000',
        unitCost: '100.01',
        newOnHand: '3.000',
      }),
    ).toBe('100.01');
    // (1 × 0.01 + 1 × 0.00) ÷ 2 = 0.005 → 0.01 (half away from zero)
    expect(
      weightedAverage({
        onHand: '1.000',
        avgCost: '0.01',
        qty: '1.000',
        unitCost: '0.00',
        newOnHand: '2.000',
      }),
    ).toBe('0.01');
  });

  it('fractional quantities stay exact (no floats)', () => {
    // (2.5 × 80.00 + 0.5 × 92.00) ÷ 3 = 246.00 ÷ 3 = 82.00
    expect(
      weightedAverage({
        onHand: '2.500',
        avgCost: '80.00',
        qty: '0.500',
        unitCost: '92.00',
        newOnHand: '3.000',
      }),
    ).toBe('82.00');
  });
});
