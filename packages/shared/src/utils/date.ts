/** Dates are stored in UTC and displayed in Asia/Dhaka (roadmap 4.4). */
export const DISPLAY_TIME_ZONE = 'Asia/Dhaka';

/** Day-month-year in Asia/Dhaka, e.g. "14/11/2026" (spec C-09). */
export function formatDateBD(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Date and 24-hour time in Asia/Dhaka, e.g. "16/11/2026, 10:30"; Bangla digits with 'bn-BD'. */
export function formatDateTimeBD(iso: string, locale: 'en-BD' | 'bn-BD' = 'en-BD'): string {
  return new Intl.DateTimeFormat(locale === 'bn-BD' ? 'bn-BD' : 'en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const BUSINESS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The business date ("YYYY-MM-DD") of an instant in Asia/Dhaka: the day a document belongs to (ADR 0016, 0023).
 * The server passes its own clock; a client never chooses the date of a money document.
 */
export function businessDateInDhaka(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('businessDateInDhaka: invalid date');
  return BUSINESS_DATE.format(instant);
}
