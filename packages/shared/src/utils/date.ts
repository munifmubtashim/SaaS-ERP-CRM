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

/** A long date in Asia/Dhaka: "Thursday 12 November 2026" (Bangla with 'bn-BD'). */
export function formatLongDateBD(iso: string, locale: 'en-BD' | 'bn-BD' = 'en-BD'): string {
  return new Intl.DateTimeFormat(locale === 'bn-BD' ? 'bn-BD' : 'en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(new Date(iso))
    .replace(/^(\p{L}+), /u, locale === 'bn-BD' ? '$1, ' : '$1 ');
}

/** A 12-hour time in Asia/Dhaka: "9:00 AM". */
export function formatTimeBD(iso: string, locale: 'en-BD' | 'bn-BD' = 'en-BD'): string {
  return new Intl.DateTimeFormat(locale === 'bn-BD' ? 'bn-BD' : 'en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** The hour (0 to 23) in Asia/Dhaka, e.g. for a time-of-day greeting. */
export function hourInDhaka(iso: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return Number(hour) % 24;
}

/** The calendar date ("YYYY-MM-DD") of an instant in Asia/Dhaka. */
function dhakaDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE }).format(new Date(iso));
}

/** Whole Dhaka calendar days from `nowIso` to `date` ("YYYY-MM-DD"): 3 = in three days, 0 = today, -2 = two days ago. */
export function daysUntilBD(date: string, nowIso: string): number {
  const day = (d: string) =>
    Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((day(date) - day(dhakaDate(nowIso))) / 86_400_000);
}
