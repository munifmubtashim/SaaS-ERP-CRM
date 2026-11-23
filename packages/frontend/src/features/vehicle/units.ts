import type { VehicleUnit } from '@erp/shared';

/** The design's unit filters: All, In stock, Reserved, Not delivered (sold, not handed over), 90+ days. */
export type UnitFilter = 'all' | 'in_stock' | 'reserved' | 'sold' | 'old';

/** A unit still waiting to be sold (in stock or reserved) for 90 days or more: the design's "90+ days". */
const isOld = (unit: VehicleUnit) =>
  (unit.status === 'in_stock' || unit.status === 'reserved') && unit.daysInStock >= 90;

/** The Units list: a status filter, then a search in the chassis number, engine number or model, any case. */
export function filterUnits(
  units: readonly VehicleUnit[],
  search: string,
  filter: UnitFilter,
): VehicleUnit[] {
  const term = search.trim().toLowerCase();
  return units.filter(
    (unit) =>
      (filter === 'all' || (filter === 'old' ? isOld(unit) : unit.status === filter)) &&
      (!term ||
        [unit.chassisNo, unit.engineNo, unit.model].some((text) => text.toLowerCase().includes(term))),
  );
}

/** The summary: available to sell, reserved, sold but not delivered, and available units 90+ days old. */
export function unitSummary(units: readonly VehicleUnit[]): {
  available: number;
  reserved: number;
  notDelivered: number;
  availableOld: number;
} {
  const count = (status: VehicleUnit['status']) => units.filter((unit) => unit.status === status).length;
  return {
    available: count('in_stock'),
    reserved: count('reserved'),
    notDelivered: count('sold'),
    availableOld: units.filter((unit) => unit.status === 'in_stock' && isOld(unit)).length,
  };
}
