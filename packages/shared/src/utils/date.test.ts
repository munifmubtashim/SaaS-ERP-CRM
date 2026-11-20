import { describe, expect, it } from 'vitest';
import { formatDateBD, formatDateTimeBD } from './date.js';

describe('dates in Asia/Dhaka', () => {
  it('formats a UTC date as day/month/year in Dhaka', () => {
    expect(formatDateBD('2026-11-15T20:00:00.000Z')).toBe('16/11/2026');
  });

  it('formats date and 24-hour time in Dhaka, in English or Bangla digits', () => {
    expect(formatDateTimeBD('2026-11-16T04:30:00.000Z')).toBe('16/11/2026, 10:30');
    expect(formatDateTimeBD('2026-11-16T04:30:00.000Z', 'bn-BD')).toBe('১৬/১১/২০২৬, ১০:৩০');
  });
});
