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
