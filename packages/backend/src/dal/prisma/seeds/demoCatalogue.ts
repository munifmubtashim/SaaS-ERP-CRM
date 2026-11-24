import type { DbClient } from '../../config/db.js';
import { demoId } from './demoBusiness.js';
import type { DemoIds } from './demoOrganization.js';

/**
 * The demo catalogue (docs/demo-seed-spec.md section 2, ADR 0058 S2): about 40 quantity-tracked parts and 8
 * serial-tracked bike models, all of the invented brand "Sample Bikes". Codes use the three-five-two format with
 * invented characters, never a real part number (decision 6). Core fields only: chassis and engine numbers are the
 * Vehicle pack's (demoVehicle.ts, spec O-11). Written as the migration owner with fixed ids; a second run writes
 * nothing.
 */

const BRAND = 'Sample Bikes';

/** [name, category, sell price, unit cost, opening quantity at the Showroom]. Every value invented. */
const PARTS: readonly [string, 'Parts' | 'Oil' | 'Tyres' | 'Accessories', string, string, string][] = [
  ['Brake pad set, front, 150 cc', 'Parts', '850.00', '560.00', '40.000'],
  ['Brake pad set, rear, 150 cc', 'Parts', '780.00', '510.00', '36.000'],
  ['Brake pad set, front, 125 cc', 'Parts', '720.00', '470.00', '30.000'],
  ['Brake shoe, rear, 110 cc', 'Parts', '450.00', '290.00', '28.000'],
  ['Clutch plate set, 150 cc', 'Parts', '1650.00', '1120.00', '18.000'],
  ['Clutch cable', 'Parts', '320.00', '190.00', '45.000'],
  ['Throttle cable', 'Parts', '290.00', '170.00', '42.000'],
  ['Chain sprocket kit, 150 cc', 'Parts', '3450.00', '2380.00', '14.000'],
  ['Chain sprocket kit, 125 cc', 'Parts', '2950.00', '2010.00', '12.000'],
  ['Spark plug, standard', 'Parts', '280.00', '160.00', '80.000'],
  ['Spark plug, iridium', 'Parts', '950.00', '620.00', '25.000'],
  ['Air filter, 150 cc', 'Parts', '650.00', '410.00', '30.000'],
  ['Air filter, 125 cc', 'Parts', '580.00', '360.00', '26.000'],
  ['Oil filter', 'Parts', '380.00', '230.00', '50.000'],
  ['Headlight bulb, 12 V', 'Parts', '240.00', '140.00', '60.000'],
  ['Indicator bulb, pair', 'Parts', '180.00', '100.00', '70.000'],
  ['Battery, 12 V 5 Ah', 'Parts', '3200.00', '2250.00', '15.000'],
  ['Battery, 12 V 9 Ah', 'Parts', '4800.00', '3420.00', '10.000'],
  ['Rear shock absorber, pair', 'Parts', '6500.00', '4650.00', '8.000'],
  ['Front fork seal kit', 'Parts', '1250.00', '820.00', '16.000'],
  ['Side mirror, pair', 'Parts', '900.00', '580.00', '22.000'],
  ['Horn, 12 V', 'Parts', '550.00', '340.00', '24.000'],
  ['Engine oil, 10W-40, 1 litre', 'Oil', '750.00', '520.00', '90.000'],
  ['Engine oil, 20W-50, 1 litre', 'Oil', '680.00', '470.00', '80.000'],
  ['Engine oil, 10W-30, 1 litre', 'Oil', '820.00', '580.00', '60.000'],
  ['Gear oil, 100 ml', 'Oil', '220.00', '130.00', '50.000'],
  ['Brake fluid, DOT 4, 250 ml', 'Oil', '350.00', '210.00', '40.000'],
  ['Chain lube spray', 'Oil', '480.00', '300.00', '35.000'],
  ['Tyre, front, 2.75-17', 'Tyres', '2850.00', '2050.00', '20.000'],
  ['Tyre, rear, 3.00-17', 'Tyres', '3250.00', '2350.00', '20.000'],
  ['Tyre, rear, 100/80-17 tubeless', 'Tyres', '4650.00', '3380.00', '14.000'],
  ['Tyre, front, 90/90-17 tubeless', 'Tyres', '4250.00', '3080.00', '14.000'],
  ['Inner tube, 17 inch', 'Tyres', '480.00', '300.00', '40.000'],
  ['Helmet, half face', 'Accessories', '1850.00', '1250.00', '20.000'],
  ['Helmet, full face', 'Accessories', '4500.00', '3150.00', '12.000'],
  ['Riding gloves, pair', 'Accessories', '950.00', '610.00', '25.000'],
  ['Seat cover', 'Accessories', '650.00', '400.00', '30.000'],
  ['Phone holder, handlebar', 'Accessories', '750.00', '480.00', '28.000'],
  ['Disc lock', 'Accessories', '1350.00', '900.00', '18.000'],
  ['Rain cover, bike', 'Accessories', '9500.00', '6800.00', '4.000'],
];

/** [name, chassis prefix, engine prefix, sell price, unit cost, units at the Showroom]. Every value invented. */
export const DEMO_MODELS: readonly [string, string, string, string, string, number][] = [
  ['Velo 150 V3', 'VL3', 'E3V', '245000.00', '214000.00', 6],
  ['Ridge 125 S', 'RG5', 'E5R', '185000.00', '161500.00', 5],
  ['Velo 160 R', 'VR6', 'E6V', '275000.00', '240500.00', 4],
  ['Breeze 110', 'BZ1', 'E1B', '145000.00', '126000.00', 5],
  ['Ridge 150 X', 'RX5', 'E5X', '238000.00', '208000.00', 3],
  ['Nimbus 125 Scooter', 'NM2', 'E2N', '199000.00', '173500.00', 3],
  ['Trail 250 Adventure', 'TR2', 'E2T', '410000.00', '359000.00', 2],
  ['Velo 150 V3 ABS', 'VA3', 'E3A', '268000.00', '234000.00', 2],
];

const CATEGORY_CODE = { Parts: '5VX', Oil: '9OL', Tyres: '7TY', Accessories: '3AC' } as const;

/** The part at `index`'s code: three-five-two (`5VX-F5805-10`). */
const partCode = (index: number, category: keyof typeof CATEGORY_CODE) =>
  `${CATEGORY_CODE[category]}-F${String(5801 + index)}-${String(10 + (index % 80)).padStart(2, '0')}`;
const modelCode = (index: number) => `BK1-M${String(4501 + index)}-26`;

export const demoProductId = (ids: DemoIds, key: string) => demoId(ids.businessId, `product:${key}`);

/** What businessLogic moves in as opening stock for the parts (kind opening, at the Showroom). */
export function demoOpeningParts(ids: DemoIds): { productId: string; qty: string; unitCost: string }[] {
  return PARTS.map(([, , , unitCost, qty], index) => ({
    productId: demoProductId(ids, `part:${index}`),
    qty,
    unitCost,
  }));
}

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

export async function inDemoBusiness<T>(db: DbClient, ids: DemoIds, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${ids.organizationId}, true),
             set_config('app.business_ids', ${ids.businessId}, true),
             set_config('app.branch_ids', ${ids.branchIds.join(',')}, true)`;
    return fn(tx);
  });
}

export async function seedDemoCatalogue(db: DbClient, ids: DemoIds): Promise<void> {
  await inDemoBusiness(db, ids, async (tx) => {
    for (const [index, [name, category, price]] of PARTS.entries()) {
      await tx.$executeRaw`
        INSERT INTO product (id, business_id, code, name, brand, category, unit, tracking, sell_price)
        VALUES (${demoProductId(ids, `part:${index}`)}::uuid, ${ids.businessId}::uuid, ${partCode(index, category)},
                ${name}, ${BRAND}, ${category}, 'pcs', 'quantity', ${price}::numeric)
        ON CONFLICT DO NOTHING`;
    }
    for (const [index, [name, , , price]] of DEMO_MODELS.entries()) {
      await tx.$executeRaw`
        INSERT INTO product (id, business_id, code, name, brand, category, unit, tracking, sell_price)
        VALUES (${demoProductId(ids, `model:${index}`)}::uuid, ${ids.businessId}::uuid, ${modelCode(index)}, ${name},
                ${BRAND}, 'Bikes', 'unit', 'serial', ${price}::numeric)
        ON CONFLICT DO NOTHING`;
    }
  });
}
