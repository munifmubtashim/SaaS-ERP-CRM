import { allocate, compareMoney, formatMoney, isNegative, isZero, parseMoney } from '@erp/shared';
import type { BusinessDashboardRow } from '@erp/shared';

export type BusinessWithShare = BusinessDashboardRow & {
  /** This business's part of all dues as a percent with two decimals ("76.12"), or null when not shown. */
  share: string | null;
};

const HUNDRED = parseMoney('100.00');

/**
 * Businesses by dues, largest first, each with its share of all dues. The shares come from the shared
 * `allocate` (largest remainder), so they always add up to exactly 100.00 and no float is involved.
 * No shares when nothing is owed, or when a business has customers in credit: a share of a total that
 * mixes signs would mislead.
 */
export function byDuesWithShare(businesses: readonly BusinessDashboardRow[]): BusinessWithShare[] {
  const sorted = [...businesses].sort((a, b) => compareMoney(parseMoney(b.dues), parseMoney(a.dues)));
  const dues = sorted.map((b) => parseMoney(b.dues));
  const showShares = !dues.some(isNegative) && !dues.every(isZero);
  const shares = showShares ? allocate(HUNDRED, dues).map(formatMoney) : [];
  return sorted.map((b, i) => ({ ...b, share: shares[i] ?? null }));
}
