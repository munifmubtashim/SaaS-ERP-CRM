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

/** Today's calendar date ("YYYY-MM-DD") in Asia/Dhaka, at the instant `nowIso`. */
export function todayBD(nowIso: string): string {
  return dhakaDate(nowIso);
}

const utcDay = (date: string) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** A calendar date ("YYYY-MM-DD") moved by whole days; negative goes back. No time zone is involved. */
export function addDaysISO(date: string, days: number): string {
  return new Date(utcDay(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** A month ("YYYY-MM") moved by whole months; negative goes back. */
export function addMonthsISO(month: string, months: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** How many days a month ("YYYY-MM") has. */
export function daysInMonthISO(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

/** The Saturday on or before a calendar date ("YYYY-MM-DD"): forecast weeks start on Saturday (ADR 0047, 0047-1). */
export function weekStartBD(date: string): string {
  const weekday = new Date(utcDay(date)).getUTCDay(); // 0 Sunday … 6 Saturday
  return addDaysISO(date, -((weekday + 1) % 7));
}
