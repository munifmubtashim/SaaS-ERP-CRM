import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IStockService, StockMovementDraft } from '../contracts/provided/IStockService.js';

/**
 * ADR 0012 test 2: the stock contract. Run against FakeStockService here and against the real StockService in its
 * integration tests (ADR 0021). `onHand` reads the current quantity of one product at one branch.
 */
export interface StockHarness {
  service: IStockService;
  onHand(productId: string, branchId: string): Promise<string>;
}

const BRANCH = '01937000-0000-7000-8000-0000000000e0';
const PRODUCT = '01937000-0000-7000-8000-0000000000f0';
const OTHER = '01937000-0000-7000-8000-0000000000f1';

const movement = (qtyDelta: string, productId = PRODUCT): StockMovementDraft => ({
  productId,
  branchId: BRANCH,
  qtyDelta,
  source: { type: 'test', id: `t-${qtyDelta}` },
});

export function stockContract(name: string, make: () => Promise<StockHarness>): void {
  describe(`${name} meets the IStockService contract (ADR 0012 test 2)`, () => {
    it('a receipt raises on-hand and a sale lowers it', async () => {
      const { service, onHand } = await make();
      await service.move([{ ...movement('5.000'), unitCost: '1000.00' }]);
      expect(await onHand(PRODUCT, BRANCH)).toBe('5.000');
      const { movementIds } = await service.move([movement('-1.500')]);
      expect(movementIds).toHaveLength(1);
      expect(await onHand(PRODUCT, BRANCH)).toBe('3.500');
    });

    it('a sale below zero is refused with 409 stock.insufficient, and nothing in the call is written', async () => {
      const { service, onHand } = await make();
      await service.move([movement('1.000'), movement('1.000', OTHER)]);
      const error = await service.move([movement('-1.000', OTHER), movement('-2.000')]).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('CONFLICT');
      expect((error as AppError).fields[0]?.code).toBe('stock.insufficient');
      expect(await onHand(PRODUCT, BRANCH)).toBe('1.000');
      expect(await onHand(OTHER, BRANCH)).toBe('1.000');
    });

    it('two parallel sales of the last unit: exactly one succeeds (spec F-02)', async () => {
      const { service, onHand } = await make();
      await service.move([movement('1.000')]);
      const results = await Promise.allSettled([
        service.move([movement('-1.000')]),
        service.move([movement('-1.000')]),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await onHand(PRODUCT, BRANCH)).toBe('0.000');
    });
  });
}
