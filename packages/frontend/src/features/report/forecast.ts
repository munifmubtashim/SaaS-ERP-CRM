import { addMoney, formatMoney, parseMoney, subtractMoney, sumMoney, type CashForecast } from '@erp/shared';

export interface ForecastWeek {
  weekStart: string;
  opening: string;
  expectedCollections: string;
  supplierBills: string;
  recurringExpenses: string;
  salaries: string;
  closing: string;
}

/**
 * The cash forecast's derived figures (ADR 0047 section 1): the opening is cash plus bank plus mobile money; each
 * week closes at its opening plus expected collections, less supplier bills, recurring expenses and salaries, and
 * that closing opens the next week. The Uncertain line (dues already overdue) is never added. Money stays in paisa
 * through the shared helpers, so there is no rounding drift (ADR 0047 test 6).
 */
export function forecastWeeks(forecast: CashForecast): {
  opening: string;
  weeks: ForecastWeek[];
  uncertain: string;
} {
  const { cash, bank, mobileMoney } = forecast.opening;
  const opening = sumMoney([cash, bank, mobileMoney].map(parseMoney));
  let running = opening;
  const weeks = forecast.buckets.map((bucket) => {
    const start = running;
    const out = sumMoney([bucket.supplierBills, bucket.recurringExpenses, bucket.salaries].map(parseMoney));
    running = subtractMoney(addMoney(start, parseMoney(bucket.expectedCollections)), out);
    return { ...bucket, opening: formatMoney(start), closing: formatMoney(running) };
  });
  return { opening: formatMoney(opening), weeks, uncertain: forecast.uncertain };
}
