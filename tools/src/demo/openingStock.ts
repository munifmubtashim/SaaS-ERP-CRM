import { DEMO_BRANCHES } from './branches.ts';
import { DEMO_PRODUCTS } from './products.ts';
import { SeededRandom } from './random.ts';
import type { DemoPartStock, DemoUnit } from './types.ts';

const STOCK_SEED = 20261101;
const COLOURS = ['Black', 'Red', 'Blue', 'Grey', 'White'] as const;
const pad6 = (n: number) => String(n).padStart(6, '0');

function buildOpeningStock(): { units: DemoUnit[]; parts: DemoPartStock[] } {
  const rng = new SeededRandom(STOCK_SEED);
  const units: DemoUnit[] = [];
  const motors = DEMO_BRANCHES.filter((b) => b.business === 'Demo Motors');
  for (const product of DEMO_PRODUCTS.filter((p) => p.tracking === 'serial')) {
    for (const branch of motors) {
      const count = rng.int(3, 4);
      for (let i = 0; i < count; i += 1) {
        const n = units.length + 1;
        units.push({
          chassisNo: `DMO-CH-${pad6(n)}`,
          engineNo: `DMO-EN-${pad6(n)}`,
          colour: rng.pick(COLOURS),
          productCode: product.code,
          branchCode: branch.code,
        });
      }
    }
  }
  const parts: DemoPartStock[] = [];
  for (const product of DEMO_PRODUCTS.filter((p) => p.tracking === 'quantity')) {
    for (const branch of DEMO_BRANCHES) {
      parts.push({ productCode: product.code, branchCode: branch.code, qty: `${rng.int(20, 80)}.000` });
    }
  }
  return { units, parts };
}

const opening = buildOpeningStock();

/** About 120 bike units with unique invented chassis numbers (DMO-CH-000123), in Demo Motors branches only. */
export const DEMO_UNITS: readonly DemoUnit[] = opening.units;

/** Opening part and accessory stock per branch, as three-decimal quantity strings. */
export const DEMO_OPENING_PART_STOCK: readonly DemoPartStock[] = opening.parts;
