import { describe, expect, it } from 'vitest';
import { businessDateInDhaka, formatDateBD, formatDateTimeBD } from './date.js';

describe('dates in Asia/Dhaka', () => {
  it('formats a UTC date as day/month/year in Dhaka', () => {
    expect(formatDateBD('2026-11-15T20:00:00.000Z')).toBe('16/11/2026');
  });

  it('formats date and 24-hour time in Dhaka, in English or Bangla digits', () => {
    expect(formatDateTimeBD('2026-11-16T04:30:00.000Z')).toBe('16/11/2026, 10:30');
    expect(formatDateTimeBD('2026-11-16T04:30:00.000Z', 'bn-BD')).toBe('১৬/১১/২০২৬, ১০:৩০');
  });
});

describe('businessDateInDhaka (the business day, ADR 0016 and 0023)', () => {
  it.each([
    ['2026-11-21T17:59:59Z', '2026-11-21'],
    ['2026-11-21T18:00:00Z', '2026-11-22'],
    ['2026-11-21T19:30:00Z', '2026-11-22'],
    ['2026-12-31T18:00:00Z', '2027-01-01'],
    ['2026-03-01T00:00:00Z', '2026-03-01'],
  ])('%s is %s in Dhaka', (instant, expected) => {
    expect(businessDateInDhaka(new Date(instant))).toBe(expected);
  });

  it('refuses an invalid date instead of printing "Invalid Date"', () => {
    expect(() => businessDateInDhaka(new Date('nope'))).toThrow();
  });
});
