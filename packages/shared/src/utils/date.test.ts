import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  addMonthsISO,
  daysInMonthISO,
  daysUntilBD,
  formatDateBD,
  formatDateTimeBD,
  formatDayMonthBD,
  formatLongDateBD,
  formatTimeBD,
  hourInDhaka,
  todayBD,
  weekStartBD,
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

describe('calendar dates for relative sample data, in Asia/Dhaka', () => {
  it('today is the Dhaka calendar date, which starts 6 hours before UTC midnight', () => {
    expect(todayBD('2026-11-12T03:00:00.000Z')).toBe('2026-11-12');
    expect(todayBD('2026-11-11T18:00:00.000Z')).toBe('2026-11-12'); // midnight in Dhaka
    expect(todayBD('2026-11-11T17:59:59.000Z')).toBe('2026-11-11');
  });

  it('adds days across months and years, and takes them away', () => {
    expect(addDaysISO('2026-11-12', 3)).toBe('2026-11-15');
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysISO('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('moves months across years', () => {
    expect(addMonthsISO('2026-11', -1)).toBe('2026-10');
    expect(addMonthsISO('2026-01', -1)).toBe('2025-12');
    expect(addMonthsISO('2026-08', 5)).toBe('2027-01');
  });

  it('knows how many days a month has, leap years included', () => {
    expect(daysInMonthISO('2026-11')).toBe(30);
    expect(daysInMonthISO('2026-12')).toBe(31);
    expect(daysInMonthISO('2027-02')).toBe(28);
    expect(daysInMonthISO('2028-02')).toBe(29);
  });
});

describe('forecast weeks start on Saturday (ADR 0047, decision 0047-1)', () => {
  it('a date maps to the Saturday on or before it', () => {
    expect(weekStartBD('2026-11-24')).toBe('2026-11-21'); // Tuesday
    expect(weekStartBD('2026-11-21')).toBe('2026-11-21'); // Saturday itself
    expect(weekStartBD('2026-11-20')).toBe('2026-11-14'); // Friday
    expect(weekStartBD('2027-01-01')).toBe('2026-12-26'); // across the year
  });
});

describe('short day and month, for column headings', () => {
  it('a calendar date as "7 Nov", Bangla digits in Bangla', () => {
    expect(formatDayMonthBD('2026-11-07')).toBe('7 Nov');
    expect(formatDayMonthBD('2026-12-26')).toBe('26 Dec');
    expect(formatDayMonthBD('2026-11-07', 'bn-BD')).toMatch(/^৭ /);
  });
});
