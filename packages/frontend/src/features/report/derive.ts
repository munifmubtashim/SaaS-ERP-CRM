import {
  addMoney,
  compareMoney,
  formatMoney,
  negateMoney,
  parseMoney,
  prorate,
  ratioBasisPoints,
  subtractMoney,
  sumMoney,
  ZERO,
} from '@erp/shared';

/**
 * Dashboard figures derived on screen from the service's figures (design/owner-dashboard/Main.dc.html). Money stays a
 * string in and out and is computed only through the shared money helpers. A share is a { part, whole } pair, so the
 * screen formats it with formatShare and it is rounded once.
 */
export interface Share {
  part: bigint;
  whole: bigint;
}

export interface TargetProgress {
  reached: Share;
  pace: Share;
  /** Where sales should be by now, at an even pace through the month. */
  paceAmount: string;
  behindBy: string | null;
  aheadBy: string | null;
  /** The month at this pace; null on day 0. */
  projection: string | null;
}

export function targetProgress(input: {
  target: string;
  achieved: string;
  daysElapsed: number;
  daysInMonth: number;
}): TargetProgress {
  const target = parseMoney(input.target);
  const achieved = parseMoney(input.achieved);
  const elapsed = BigInt(input.daysElapsed);
  const inMonth = BigInt(input.daysInMonth);
  const pace = prorate(target, elapsed, inMonth);
  const gap = subtractMoney(pace, achieved);
  const behind = compareMoney(gap, ZERO) > 0;
  return {
    reached: { part: achieved, whole: target },
    pace: { part: elapsed, whole: inMonth },
    paceAmount: formatMoney(pace),
    behindBy: behind ? formatMoney(gap) : null,
    aheadBy: behind ? null : formatMoney(negateMoney(gap)),
    projection: elapsed > 0n ? formatMoney(prorate(achieved, inMonth, elapsed)) : null,
  };
}

export interface AgedEntry {
  ageDays: number;
  amount: string;
}

const BUCKETS = [
  { key: '0-30', from: 0, to: 30 },
  { key: '31-60', from: 31, to: 60 },
  { key: '61+', from: 61, to: Number.POSITIVE_INFINITY },
] as const;

/** Dues by age: 0 to 30, 31 to 60, 61 or more days (the design's three bars), each with its total. */
export function agingBuckets(entries: readonly AgedEntry[]): {
  total: string;
  buckets: { key: (typeof BUCKETS)[number]['key']; amount: string; share: Share | null }[];
} {
  const totals = BUCKETS.map((b) =>
    sumMoney(
      entries.filter((e) => e.ageDays >= b.from && e.ageDays <= b.to).map((e) => parseMoney(e.amount)),
    ),
  );
  const total = sumMoney(totals);
  return {
    total: formatMoney(total),
    buckets: BUCKETS.map((b, i) => {
      const amount = totals[i] ?? ZERO;
      return {
        key: b.key,
        amount: formatMoney(amount),
        share: total > 0n ? { part: amount, whole: total } : null,
      };
    }),
  };
}

/** Dues the forecast counts: up to 60 days old (the design's "Coming in" and "Going out"). */
const dueWithin60 = (entries: readonly AgedEntry[]) =>
  sumMoney(entries.filter((e) => e.ageDays <= 60).map((e) => parseMoney(e.amount)));

/** The next 30 days, as the design estimates them: cash now, plus customer dues in, minus supplier dues out. */
export function cashForecast(
  position: { cashNow: string; averageDailySpending: string; averageDailySales: string },
  customerDues: readonly AgedEntry[],
  supplierDues: readonly AgedEntry[],
): { comingIn: string; goingOut: string; cashIn30Days: string; coverDays: number | null } {
  const cashNow = parseMoney(position.cashNow);
  const spending = parseMoney(position.averageDailySpending);
  const comingIn = dueWithin60(customerDues);
  const goingOut = dueWithin60(supplierDues);
  return {
    comingIn: formatMoney(comingIn),
    goingOut: formatMoney(goingOut),
    cashIn30Days: formatMoney(subtractMoney(addMoney(cashNow, comingIn), goingOut)),
    // Whole days the cash covers at today's spending: a count, not money.
    coverDays: spending > 0n ? Number(ratioBasisPoints(cashNow, spending) / 10_000n) : null,
  };
}

/** Profit and its share of revenue (the margin); null share when there is no revenue. */
export function margin(month: { revenue: string; expenses: string }): {
  profit: string;
  share: Share | null;
} {
  const revenue = parseMoney(month.revenue);
  const profit = subtractMoney(revenue, parseMoney(month.expenses));
  return { profit: formatMoney(profit), share: revenue > 0n ? { part: profit, whole: revenue } : null };
}
