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
 * await between them, so two parallel calls can't both take the last unit.
 */
export class FakeStockService implements IStockService {
  readonly movements: (StockMovementDraft & { id: string })[] = [];
  private readonly balances = new Map<string, bigint>();

  async move(movements: StockMovementDraft[]): Promise<{ movementIds: string[] }> {
    const sorted = [...movements].sort((a, b) =>
      `${a.productId}|${a.branchId}`.localeCompare(`${b.productId}|${b.branchId}`),
    );
    const next = new Map(this.balances);
    for (const m of sorted) {
      const key = `${m.productId}|${m.branchId}`;
      const after = (next.get(key) ?? 0n) + toMilli(m.qtyDelta);
      if (after < 0n) {
        const message = 'Not enough stock for this product at this branch.';
        throw new AppError('CONFLICT', message, [{ path: 'qtyDelta', code: 'stock.insufficient', message }]);
      }
      next.set(key, after);
    }
    for (const [key, value] of next) this.balances.set(key, value);
    const recorded = sorted.map((m) => ({ ...m, id: randomUUID() }));
    this.movements.push(...recorded);
    return { movementIds: recorded.map((m) => m.id) };
  }

  onHand(productId: string, branchId: string): string {
    return fromMilli(this.balances.get(`${productId}|${branchId}`) ?? 0n);
  }
}
