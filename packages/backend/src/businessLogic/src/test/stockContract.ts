import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IStockService, StockMovementDraft } from '../contracts/provided/IStockService.js';

/**
 * ADR 0012 test 2: the stock contract. Run against FakeStockService here and against the real StockService in its
 * integration tests (ADR 0021). `onHand` reads the current quantity of one product at one branch; `movementOf`
 * reads back what one returned movement id recorded.
 */
export interface StockHarness {
  service: IStockService;
  onHand(productId: string, branchId: string): Promise<string>;
  movementOf(movementId: string): Promise<{ productId: string; qtyDelta: string; unitId?: string }>;
}

const BRANCH = '01937000-0000-7000-8000-0000000000e0';
const PRODUCT = '01937000-0000-7000-8000-0000000000f0';
const OTHER = '01937000-0000-7000-8000-0000000000f1';
const BIKE = '01937000-0000-7000-8000-0000000000f2';
const UNIT = '01937000-0000-7000-8000-0000000000a9';

/** A receipt (positive quantity) carries a unit cost, as the contract requires; a sale (negative) doesn't. */
const movement = (qtyDelta: string, productId = PRODUCT): StockMovementDraft => ({
  productId,
  branchId: BRANCH,
  qtyDelta,
  ...(qtyDelta.startsWith('-') ? {} : { unitCost: '1000.00' }),
  source: { type: 'test', id: `t-${qtyDelta}` },
});

const unitMovement = (qtyDelta: string, unitId = UNIT): StockMovementDraft => ({
  ...movement(qtyDelta, BIKE),
  unitId,
});

async function refusal(promise: Promise<unknown>): Promise<{ code: string; field: string | undefined }> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, field: (error as AppError).fields[0]?.code };
}

export function stockContract(name: string, make: () => Promise<StockHarness>): void {
  describe(`${name} meets the IStockService contract (ADR 0012 test 2)`, () => {
    it('a receipt raises on-hand and a sale lowers it', async () => {
      const { service, onHand } = await make();
      await service.move([movement('5.000')]);
      expect(await onHand(PRODUCT, BRANCH)).toBe('5.000');
      const { movementIds } = await service.move([movement('-1.500')]);
      expect(movementIds).toHaveLength(1);
      expect(await onHand(PRODUCT, BRANCH)).toBe('3.500');
    });

    it('returns movement ids in the order the movements were given, whatever order they are applied in', async () => {
      const { service, movementOf } = await make();
      const given = [movement('2.000', OTHER), movement('3.000', PRODUCT), movement('1.000', OTHER)];
      const { movementIds } = await service.move(given);
      expect(movementIds).toHaveLength(3);
      const recorded = await Promise.all(movementIds.map((id) => movementOf(id)));
      expect(recorded.map((m) => [m.productId, m.qtyDelta])).toEqual(
        given.map((m) => [m.productId, m.qtyDelta]),
      );
    });

    it('a sale below zero is refused with 409 stock.insufficient, and nothing in the call is written', async () => {
      const { service, onHand } = await make();
      await service.move([movement('1.000'), movement('1.000', OTHER)]);
      expect(await refusal(service.move([movement('-1.000', OTHER), movement('-2.000')]))).toEqual({
        code: 'CONFLICT',
        field: 'stock.insufficient',
      });
      expect(await onHand(PRODUCT, BRANCH)).toBe('1.000');
      expect(await onHand(OTHER, BRANCH)).toBe('1.000');
    });

    it('a receipt without a unit cost is refused (a consumer bug), and nothing is written', async () => {
      const { service, onHand } = await make();
      const noCost: StockMovementDraft = {
        productId: PRODUCT,
        branchId: BRANCH,
        qtyDelta: '1.000',
        source: { type: 't', id: 'x' },
      };
      expect(await refusal(service.move([noCost]))).toEqual({
        code: 'INTERNAL_ERROR',
        field: 'stock.unit_cost_required',
      });
      expect(await onHand(PRODUCT, BRANCH)).toBe('0.000');
    });

    it('a serial unit moves one at a time: a quantity other than 1 or -1 is refused', async () => {
      const { service } = await make();
      expect(await refusal(service.move([unitMovement('2.000')]))).toEqual({
        code: 'INTERNAL_ERROR',
        field: 'stock.serial_quantity',
      });
    });

    it('a serial unit is received once, sold once, and refused when it is not in stock', async () => {
      const { service, onHand, movementOf } = await make();
      await service.move([unitMovement('1.000')]);
      expect(await refusal(service.move([unitMovement('1.000')]))).toEqual({
        code: 'CONFLICT',
        field: 'unit.already_in_stock',
      });
      const { movementIds } = await service.move([unitMovement('-1.000')]);
      expect((await movementOf(movementIds[0] ?? '')).unitId).toBe(UNIT);
      expect(await onHand(BIKE, BRANCH)).toBe('0.000');
      expect(await refusal(service.move([unitMovement('-1.000')]))).toEqual({
        code: 'CONFLICT',
        field: 'unit.not_available',
      });
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
