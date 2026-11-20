import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DISPLAY_TIME_ZONE, formatDateBD, formatDateTimeBD } from './date.js';

/**
 * Dates are stored in UTC and shown in Asia/Dhaka (roadmap 4.4, spec C-09). Bangladesh has kept UTC+6 with no
 * daylight saving since 2010, so from 2010 on the oracle below is a plain six-hour shift. The 2009 case checks
 * that the code uses the real time zone, not a fixed offset.
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Independent oracle: shift by six hours and read the UTC fields. */
function dhaka(date: Date): { day: string; time: string } {
  const d = new Date(date.getTime() + SIX_HOURS_MS);
  return {
    day: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAsciiDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(BANGLA_DIGITS.indexOf(c)));

const since2010 = fc.date({
  min: new Date('2010-01-01T00:00:00.000Z'),
  max: new Date('2099-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

describe('formatDateBD', () => {
  it('uses the Asia/Dhaka zone', () => {
    expect(DISPLAY_TIME_ZONE).toBe('Asia/Dhaka');
  });

  it('matches a six-hour shift from UTC for any instant since 2010 (property)', () => {
    fc.assert(fc.property(since2010, (date) => formatDateBD(date.toISOString()) === dhaka(date).day));
  });

  it('rolls over to the next day at 18:00 UTC, and not a minute before', () => {
    expect(formatDateBD('2026-11-15T17:59:59.999Z')).toBe('15/11/2026');
    expect(formatDateBD('2026-11-15T18:00:00.000Z')).toBe('16/11/2026');
  });

  it('rolls over the year in Dhaka before it does in UTC', () => {
    expect(formatDateBD('2026-12-31T18:30:00.000Z')).toBe('01/01/2027');
  });

  it('handles 29 February', () => {
    expect(formatDateBD('2028-02-28T18:00:00.000Z')).toBe('29/02/2028');
  });

  it('reads an ISO string with an offset, not only Z', () => {
    expect(formatDateBD('2026-11-16T01:00:00+06:00')).toBe('16/11/2026');
  });

  it('follows the real zone rules: Dhaka was UTC+7 in July 2009', () => {
    expect(formatDateBD('2009-07-01T17:30:00.000Z')).toBe('02/07/2009');
  });

  it('throws on a string that is not a date, instead of printing "Invalid Date"', () => {
    expect(() => formatDateBD('not a date')).toThrow(RangeError);
  });
});

describe('formatDateTimeBD', () => {
  it('matches a six-hour shift from UTC, as "dd/mm/yyyy, HH:MM" (property)', () => {
    fc.assert(
      fc.property(since2010, (date) => {
        const { day, time } = dhaka(date);
        return formatDateTimeBD(date.toISOString()) === `${day}, ${time}`;
      }),
    );
  });

  it('shows midnight as 00:00, never 24:00', () => {
    expect(formatDateTimeBD('2026-11-15T18:00:00.000Z')).toBe('16/11/2026, 00:00');
    expect(formatDateTimeBD('2026-11-15T18:00:00.000Z', 'bn-BD')).toBe('১৬/১১/২০২৬, ০০:০০');
  });

  it('prints the same date and time in Bangla digits as in English (property)', () => {
    fc.assert(
      fc.property(since2010, (date) => {
        const iso = date.toISOString();
        const bn = formatDateTimeBD(iso, 'bn-BD');
        return !/[0-9]/.test(bn) && toAsciiDigits(bn) === formatDateTimeBD(iso, 'en-BD');
      }),
    );
  });

  it('drops seconds rather than rounding them up', () => {
    expect(formatDateTimeBD('2026-11-16T04:30:59.999Z')).toBe('16/11/2026, 10:30');
  });
});
