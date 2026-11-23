import { describe, expect, it } from 'vitest';
import { formatPercent, parseMoney, prorate, ratioBasisPoints } from './money.js';

/** Ratios of money for the dashboard (percent of target, margin, share) and pro-rating (pace, projection). */
describe('ratioBasisPoints', () => {
  it('part of whole in basis points, rounded half away from zero', () => {
    expect(ratioBasisPoints(parseMoney('14059500.00'), parseMoney('40000000.00'))).toBe(3515n); // 35.15%
    expect(ratioBasisPoints(parseMoney('1.00'), parseMoney('3.00'))).toBe(3333n);
    expect(ratioBasisPoints(parseMoney('2.00'), parseMoney('3.00'))).toBe(6667n);
  });

  it('can exceed 100% and can be negative (a loss margin)', () => {
    expect(ratioBasisPoints(parseMoney('150.00'), parseMoney('100.00'))).toBe(15000n);
    expect(ratioBasisPoints(parseMoney('-25.00'), parseMoney('100.00'))).toBe(-2500n);
  });

  it('a whole of zero or less is refused: there is no percent of nothing', () => {
    expect(() => ratioBasisPoints(parseMoney('1.00'), parseMoney('0.00'))).toThrow(/whole above zero/);
    expect(() => ratioBasisPoints(parseMoney('1.00'), parseMoney('-1.00'))).toThrow(/whole above zero/);
  });
});

describe('prorate', () => {
  it('amount x numerator / denominator, rounded once to paisa', () => {
    // A ৳4 crore target, 11 of 30 days: the pace is ৳1,46,66,666.67.
    expect(prorate(parseMoney('40000000.00'), 11n, 30n)).toBe(parseMoney('14666666.67'));
    // Projection: ৳1,40,59,500 over 11 days, for 30 days.
    expect(prorate(parseMoney('14059500.00'), 30n, 11n)).toBe(parseMoney('38344090.91'));
  });

  it('a denominator of zero or less is refused', () => {
    expect(() => prorate(parseMoney('1.00'), 1n, 0n)).toThrow(/denominator above zero/);
  });
});

describe('formatPercent', () => {
  it('basis points as a percent with one decimal, in English or Bangla digits', () => {
    expect(formatPercent(3515n)).toBe('35.2%');
    expect(formatPercent(3510n)).toBe('35.1%');
    expect(formatPercent(-2500n)).toBe('-25.0%');
    expect(formatPercent(3510n, 'bn-BD')).toBe('৩৫.১%');
  });

  it('whole percents when asked', () => {
    expect(formatPercent(3849n, 'en-BD', 0)).toBe('38%');
    expect(formatPercent(3850n, 'en-BD', 0)).toBe('39%');
  });
});
