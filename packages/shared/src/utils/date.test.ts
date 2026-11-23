import { describe, expect, it } from 'vitest';
import {
  daysUntilBD,
  formatDateBD,
  formatDateTimeBD,
  formatLongDateBD,
  formatTimeBD,
  hourInDhaka,
} from './date.js';

describe('dates in Asia/Dhaka', () => {
  it('formats a UTC date as day/month/year in Dhaka', () => {
    expect(formatDateBD('2026-11-15T20:00:00.000Z')).toBe('16/11/2026');
  });

  it('formats date and 24-hour time in Dhaka, in English or Bangla digits', () => {
    expect(formatDateTimeBD('2026-11-16T04:30:00.000Z')).toBe('16/11/2026, 10:30');
    expect(formatDateTimeBD('2026-11-16T04:30:00.000Z', 'bn-BD')).toBe('১৬/১১/২০২৬, ১০:৩০');
  });
});

describe('dashboard dates, in Asia/Dhaka', () => {
  // 03:00 UTC is 9:00 AM in Dhaka (UTC+6); 19:30 UTC on the 11th is 1:30 AM on the 12th in Dhaka.
  it('a long date, in English or Bangla', () => {
    expect(formatLongDateBD('2026-11-12T03:00:00.000Z')).toBe('Thursday 12 November 2026');
    expect(formatLongDateBD('2026-11-11T19:30:00.000Z')).toBe('Thursday 12 November 2026');
    expect(formatLongDateBD('2026-11-12T03:00:00.000Z', 'bn-BD')).toBe('বৃহস্পতিবার, ১২ নভেম্বর, ২০২৬');
  });

  it('a 12-hour time', () => {
    expect(formatTimeBD('2026-11-12T03:00:00.000Z')).toBe('9:00 AM');
    expect(formatTimeBD('2026-11-12T10:05:00.000Z')).toBe('4:05 PM');
  });

  it('the hour of the day in Dhaka', () => {
    expect(hourInDhaka('2026-11-12T03:00:00.000Z')).toBe(9);
    expect(hourInDhaka('2026-11-11T19:30:00.000Z')).toBe(1);
  });

  it('whole days from a moment to a date, counted on Dhaka calendar days', () => {
    expect(daysUntilBD('2026-11-15', '2026-11-12T03:00:00.000Z')).toBe(3);
    expect(daysUntilBD('2026-11-12', '2026-11-11T19:30:00.000Z')).toBe(0);
    expect(daysUntilBD('2026-11-10', '2026-11-12T03:00:00.000Z')).toBe(-2);
  });
});
