import {
  AppError,
  divideByQuantity,
  formatMoney,
  multiplyByQuantity,
  parseMoney,
  addMoney,
} from '@erp/shared';
import type { IStockQuery } from './contracts/IStockQuery.js';
import type { IStockService, StockMovementDraft } from './contracts/provided/IStockService.js';

/** A quantity string with up to 3 decimals, optionally negative. */
const QUANTITY = /^-?\d{1,15}(\.\d{1,3})?$/;

/**
 * The branch's new weighted average after a receipt (ADR 0021 section 2, invariant 7):
 * (on hand × average + quantity × unit cost) ÷ new on hand, through the shared money helpers, rounded once, half away
 * from zero, to paisa (divideByQuantity). `newOnHand` comes from the database, which adds the quantities exactly.
 */
export function weightedAverage(input: {
  onHand: string;
  avgCost: string;
  qty: string;
  unitCost: string;
  newOnHand: string;
}): string {
  const held = multiplyByQuantity(parseMoney(input.avgCost), input.onHand);
  const added = multiplyByQuantity(parseMoney(input.unitCost), input.qty);
  return formatMoney(divideByQuantity(addMoney(held, added), input.newOnHand));
}

function consumerBug(code: string, message: string): AppError {
  return new AppError('INTERNAL_ERROR', message, [{ path: 'movements', code, message }]);
}
function conflict(code: string, message: string, path: string): AppError {
  return new AppError('CONFLICT', message, [{ path, code, message }]);
}

/**
 * Inventory's stock service (ADR 0012 section 3, ADR 0021 section 2 as amended by ADR 0054). Runs in the caller's
 * transaction and never opens one (invariant 4): a refusal throws, and the caller's whole transaction rolls back, so
 * a refused call writes nothing. Every draft is checked before anything is written; movements are then applied
 * sorted by (product, branch), so two documents touching the same products can't deadlock.
 */
export class StockService implements IStockService {
  constructor(private readonly stock: IStockQuery) {}

  async move(movements: StockMovementDraft[]): Promise<{ movementIds: string[]; costs: string[] }> {
    for (const m of movements) this.check(m);
    const order = movements
      .map((m, index) => ({ m, index }))
      .sort((a, b) =>
        a.m.productId === b.m.productId
          ? a.m.branchId.localeCompare(b.m.branchId)
          : a.m.productId.localeCompare(b.m.productId),
      );
    const movementIds: string[] = new Array<string>(movements.length);
    const costs: string[] = new Array<string>(movements.length);
    for (const { m, index } of order) {
      const done = await this.apply(m);
      movementIds[index] = done.id;
      costs[index] = done.cost;
    }
    return { movementIds, costs };
  }

  /** A consumer bug is refused before anything is written. */
  private check(m: StockMovementDraft): void {
    if (!QUANTITY.test(m.qtyDelta) || /^-?0+(\.0+)?$/.test(m.qtyDelta))
      throw consumerBug('stock.quantity', `Not a non-zero quantity with up to 3 decimals: ${m.qtyDelta}`);
    const out = m.qtyDelta.startsWith('-');
    if (!out && m.unitCost === undefined)
      throw consumerBug('stock.unit_cost_required', 'A receipt must carry its unit cost.');
    if (m.unitId !== undefined && !/^-?1(\.0{1,3})?$/.test(m.qtyDelta))
      throw consumerBug('stock.serial_quantity', 'A serial unit moves one at a time (1 or -1).');
  }

  private async apply(m: StockMovementDraft): Promise<{ id: string; cost: string }> {
    const out = m.qtyDelta.startsWith('-');
    const qty = out ? m.qtyDelta.slice(1) : m.qtyDelta;
    let unitCost: string | null = null;
    if (m.unitId !== undefined) {
      const unit = await this.stock.lockUnit(m.unitId, m.branchId);
      const inStock = unit !== null && /^1(\.0+)?$/.test(unit.inLedger);
      if (!out && inStock)
        throw conflict('unit.already_in_stock', 'This unit is already in stock.', 'unitId');
      if (out && !inStock) throw conflict('unit.not_available', 'This unit is not in stock.', 'unitId');
      if (unit === null) throw conflict('unit.not_available', 'This unit is not at this branch.', 'unitId');
      unitCost = out ? unit.unitCost : null;
    }
    let cost: string;
    if (out) {
      const location = await this.stock.defaultLocation(m.branchId);
      cost = unitCost ?? (await this.stock.costForOut(m.branchId, m.productId)) ?? '0.00';
      const left = await this.stock.takeOut(m.branchId, m.productId, location, qty);
      if (left === null) {
        throw conflict('stock.insufficient', 'Not enough stock for this product at this branch.', 'qtyDelta');
      }
    } else {
      cost = formatMoney(parseMoney(m.unitCost ?? '0.00'));
      const { locationId, onHand, avgCost } = await this.stock.lockForIn(m.branchId, m.productId);
      const newOnHand = await this.stock.addIn(m.branchId, m.productId, locationId, qty);
      // Serial units carry their own cost and don't average (invariant 7).
      if (m.unitId === undefined) {
        await this.stock.setCost(
          m.branchId,
          m.productId,
          weightedAverage({ onHand, avgCost, qty, unitCost: cost, newOnHand }),
        );
      }
    }
    const id = await this.stock.insertMovement({
      branchId: m.branchId,
      productId: m.productId,
      serialUnitId: m.unitId ?? null,
      qtyDelta: m.qtyDelta,
      unitCost: cost,
      kind: m.kind ?? (out ? 'sale' : 'receipt'),
      reason: m.reason ?? null,
      sourceType: m.source.type,
      sourceId: m.source.id,
    });
    return { id, cost };
  }
}
