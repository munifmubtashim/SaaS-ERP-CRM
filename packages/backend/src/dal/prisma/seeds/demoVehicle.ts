import type { DbClient } from '../../config/db.js';
import { demoId } from './demoBusiness.js';
import { DEMO_MODELS, demoProductId, inDemoBusiness } from './demoCatalogue.js';
import type { DemoIds } from './demoOrganization.js';

/**
 * The Vehicle pack's demo seed step (docs/demo-seed-spec.md section 2, ADR 0058 S2; spec O-11): the chassis units of
 * the 8 bike models, each with its engine number and colour in vehicle_unit, and the registration-fee product, a
 * pass-through fee with VAT on fee off (item 3d: it posts to pass_through_payable, never revenue, invariant 8).
 *
 * Each unit is a serial_unit row at the Showroom with its own cost (invariant 7). The row alone is not stock: on hand is
 * the sum of movements (invariant 3), so businessLogic brings each unit in with its own opening movement (decision 5).
 * Written as the migration owner with fixed ids; a second run writes nothing. Every number is invented.
 */

const COLOURS = ['Black', 'Red', 'Blue', 'Grey', 'White', 'Silver'] as const;

/** The registration fee: what the customer pays for the authority, held for them (a liability). Invented amount. */
const REGISTRATION_FEE = { name: 'Registration fee', code: 'REG-F0001-26', price: '15000.00' } as const;

export const demoRegistrationFeeId = (ids: DemoIds) => demoProductId(ids, 'registration-fee');
export const DEMO_REGISTRATION_FEE_PRICE = REGISTRATION_FEE.price;
/** The `n`th unit (from 0) of model `model`. */
export const demoUnitId = (ids: DemoIds, model: number, n: number) =>
  demoId(ids.businessId, `unit:${model}:${n}`);

interface DemoUnit {
  unitId: string;
  productId: string;
  chassisNo: string;
  engineNo: string;
  colour: string;
  unitCost: string;
}

/** Every chassis unit: 2 to 6 per model, numbered 000101, 000102, … per model. */
export function demoUnits(ids: DemoIds): DemoUnit[] {
  return DEMO_MODELS.flatMap(([, chassis, engine, , unitCost, count], model) =>
    Array.from({ length: count }, (_, n) => ({
      unitId: demoUnitId(ids, model, n),
      productId: demoProductId(ids, `model:${model}`),
      chassisNo: `${chassis}-${String(101 + n).padStart(6, '0')}`,
      engineNo: `${engine}-${String(550101 + n)}`,
      colour: COLOURS[(model + n) % COLOURS.length] ?? 'Black',
      unitCost,
    })),
  );
}

export async function seedDemoVehicles(db: DbClient, ids: DemoIds): Promise<void> {
  const showroom = ids.branchIds[0];
  await inDemoBusiness(db, ids, async (tx) => {
    await tx.$executeRaw`
      INSERT INTO product (id, business_id, code, name, brand, category, unit, tracking, sell_price, is_pass_through,
                           vat_on_fee)
      VALUES (${demoRegistrationFeeId(ids)}::uuid, ${ids.businessId}::uuid, ${REGISTRATION_FEE.code},
              ${REGISTRATION_FEE.name}, NULL, 'Fees', 'pcs', 'quantity', ${REGISTRATION_FEE.price}::numeric, true, false)
      ON CONFLICT DO NOTHING`;
    for (const unit of demoUnits(ids)) {
      await tx.$executeRaw`
        INSERT INTO serial_unit (id, business_id, branch_id, product_id, serial_no, status, unit_cost)
        VALUES (${unit.unitId}::uuid, ${ids.businessId}::uuid, ${showroom}::uuid, ${unit.productId}::uuid,
                ${unit.chassisNo}, 'in_stock', ${unit.unitCost}::numeric)
        ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`
        INSERT INTO vehicle_unit (serial_unit_id, business_id, engine_no, colour)
        VALUES (${unit.unitId}::uuid, ${ids.businessId}::uuid, ${unit.engineNo}, ${unit.colour})
        ON CONFLICT DO NOTHING`;
    }
  });
}
