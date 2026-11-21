import { randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import type { IStockService, StockMovementDraft } from '../contracts/provided/IStockService.js';

/** numeric(18,3): up to 15 integer digits and exactly 3 decimals, as a string. */
const QUANTITY = /^(-?)(\d{1,15})\.(\d{3})$/;

/** Quantity in thousandths, as a bigint: never a float. */
function toMilli(quantity: string): bigint {
  const match = QUANTITY.exec(quantity);
  if (!match) throw new AppError('INTERNAL_ERROR', `Not a quantity with 3 decimals: ${quantity}`);
  const [, sign, whole = '0', decimals = '000'] = match;
  const milli = BigInt(whole) * 1000n + BigInt(decimals);
  return sign === '-' ? -milli : milli;
}

function fromMilli(milli: bigint): string {
  const sign = milli < 0n ? '-' : '';
  const abs = milli < 0n ? -milli : milli;
  return `${sign}${abs / 1000n}.${(abs % 1000n).toString().padStart(3, '0')}`;
}

/**
 * In-memory IStockService for consumers' unit tests (ADR 0012 section 5); passes the stock contract suite. A call
 * checks every movement before writing any, so a refusal writes nothing, and the check and the write happen with no
 * await between them, so two parallel calls can't both take the last unit. Movements are applied sorted by
 * (productId, branchId), and their ids come back in the order they were given.
 */
export class FakeStockService implements IStockService {
  readonly movements: (StockMovementDraft & { id: string })[] = [];
  private readonly balances = new Map<string, bigint>();
  /** Serial units currently in stock. */
  private readonly unitsInStock = new Set<string>();

  async move(movements: StockMovementDraft[]): Promise<{ movementIds: string[] }> {
    const order = movements
      .map((m, index) => ({ m, index }))
      .sort((a, b) => `${a.m.productId}|${a.m.branchId}`.localeCompare(`${b.m.productId}|${b.m.branchId}`));
    const next = new Map(this.balances);
    const units = new Set(this.unitsInStock);
    for (const { m } of order) {
      const delta = toMilli(m.qtyDelta);
      if (delta > 0n && m.unitCost === undefined) {
        throw consumerBug('stock.unit_cost_required', 'A receipt must carry its unit cost.');
      }
      if (m.unitId !== undefined) applyUnit(units, m.unitId, delta);
      const key = `${m.productId}|${m.branchId}`;
      const after = (next.get(key) ?? 0n) + delta;
      if (after < 0n) {
        const message = 'Not enough stock for this product at this branch.';
        throw new AppError('CONFLICT', message, [{ path: 'qtyDelta', code: 'stock.insufficient', message }]);
      }
      next.set(key, after);
    }
    for (const [key, value] of next) this.balances.set(key, value);
    this.unitsInStock.clear();
    for (const unit of units) this.unitsInStock.add(unit);
    const recorded = movements.map((m) => ({ ...m, id: randomUUID() }));
    this.movements.push(...order.map(({ index }) => recorded[index] as StockMovementDraft & { id: string }));
    return { movementIds: recorded.map((m) => m.id) };
  }

  onHand(productId: string, branchId: string): string {
    return fromMilli(this.balances.get(`${productId}|${branchId}`) ?? 0n);
  }
}

/** Serial units (invariant 7, ADR 0020): one at a time; in only when not in stock, out only when in stock. */
function applyUnit(units: Set<string>, unitId: string, delta: bigint): void {
  if (delta !== 1000n && delta !== -1000n) {
    throw consumerBug('stock.serial_quantity', 'A serial unit moves one at a time (1 or -1).');
  }
  if (delta > 0n) {
    if (units.has(unitId)) throw conflict('unit.already_in_stock', 'This unit is already in stock.');
    units.add(unitId);
  } else {
    if (!units.has(unitId)) throw conflict('unit.not_available', 'This unit is not in stock.');
    units.delete(unitId);
  }
}

function consumerBug(code: string, message: string): AppError {
  return new AppError('INTERNAL_ERROR', message, [{ path: 'movements', code, message }]);
}

function conflict(code: string, message: string): AppError {
  return new AppError('CONFLICT', message, [{ path: 'unitId', code, message }]);
}
