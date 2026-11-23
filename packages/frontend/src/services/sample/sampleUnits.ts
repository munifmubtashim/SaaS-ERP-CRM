import { addDaysISO, type ProductModelSummary, type VehicleUnitDetail } from '@erp/shared';

/*
 * Invented models and units for the Products screen (no real brands, models, numbers or prices). The chassis numbers
 * match the POS sample's units, so the demo tells one story. Every screen showing them carries the Demo data badge.
 */
export const MODELS = [
  { id: 'velo-150', name: 'Velo 150 V3', price: '245000.00' },
  { id: 'ridge-125', name: 'Ridge 125 S', price: '168000.00' },
  { id: 'crest-160', name: 'Crest 160 R', price: '289000.00' },
  { id: 'breeze-110', name: 'Breeze 110 Scooter', price: '142000.00' },
];
const BUSINESS = 'Sample Motors';

type Row = [
  chassisNo: string,
  model: string,
  colour: string,
  branchName: string,
  status: VehicleUnitDetail['status'],
  /** Days since it was received; for a sold or delivered unit, when it came in. */
  days: number,
  customerName: string | null,
  invoiceNumber: string | null,
  advance: string | null,
  registrationDone: VehicleUnitDetail['registrationDone'],
];

const ROWS: Row[] = [
  ['VL3-000101', 'Velo 150 V3', 'Racing blue', 'Mirpur-10', 'in_stock', 12, null, null, null, []],
  ['VL3-000102', 'Velo 150 V3', 'Matte black', 'Uttara', 'in_stock', 104, null, null, null, []],
  ['VL3-000103', 'Velo 150 V3', 'Racing blue', 'Narayanganj', 'in_stock', 40, null, null, null, []],
  [
    'VL3-000097',
    'Velo 150 V3',
    'Matte black',
    'Mirpur-10',
    'reserved',
    20,
    'Sample Customer One',
    null,
    '20000.00',
    [],
  ],
  [
    'VL3-000099',
    'Velo 150 V3',
    'Racing blue',
    'Mirpur-10',
    'delivered',
    70,
    'Sample Traders',
    'C-000123',
    null,
    ['papers_sent', 'fee_paid', 'registered', 'plate_fitted'],
  ],
  ['RG1-000201', 'Ridge 125 S', 'Red', 'Mirpur-10', 'in_stock', 8, null, null, null, []],
  ['RG1-000202', 'Ridge 125 S', 'Black', 'Agrabad', 'in_stock', 96, null, null, null, []],
  ['RG1-000198', 'Ridge 125 S', 'Red', 'Uttara', 'reserved', 95, 'Sample Riders Club', null, '15000.00', []],
  [
    'RG1-000199',
    'Ridge 125 S',
    'Black',
    'Mirpur-10',
    'sold',
    45,
    'Sample Customer One',
    'C-000122',
    null,
    [],
  ],
  ['CR6-000301', 'Crest 160 R', 'Grey', 'Mirpur-10', 'in_stock', 30, null, null, null, []],
  ['CR6-000302', 'Crest 160 R', 'Grey', 'Uttara', 'in_stock', 5, null, null, null, []],
  [
    'CR6-000299',
    'Crest 160 R',
    'Grey',
    'Mirpur-10',
    'delivered',
    50,
    'Sample Enterprise',
    'C-000119',
    null,
    ['papers_sent', 'fee_paid'],
  ],
  ['BZ1-000401', 'Breeze 110 Scooter', 'White', 'Narayanganj', 'in_stock', 61, null, null, null, []],
  [
    'BZ1-000402',
    'Breeze 110 Scooter',
    'White',
    'Agrabad',
    'sold',
    33,
    'Sample Customer Two',
    'C-000110',
    null,
    [],
  ],
];

/** The units as of `today` (Dhaka, "YYYY-MM-DD"): days in stock count only while a unit waits to be sold. */
export function sampleUnits(today: string): VehicleUnitDetail[] {
  return ROWS.map(
    ([chassisNo, model, colour, branchName, status, days, customerName, invoiceNumber, advance, done]) => ({
      chassisNo,
      engineNo: `${chassisNo.slice(0, 2)}E-${chassisNo.slice(4)}`,
      model,
      colour,
      branchName,
      status,
      receivedOn: addDaysISO(today, -days),
      daysInStock: status === 'in_stock' || status === 'reserved' ? days : 0,
      customerName,
      invoiceNumber,
      advance,
      registrationDone: done,
    }),
  );
}

/** Each model with its price and its units by state (counts only), from the same units. */
export function sampleModels(): ProductModelSummary[] {
  const units = sampleUnits('2026-01-01');
  const count = (model: string, ...statuses: VehicleUnitDetail['status'][]) =>
    units.filter((u) => u.model === model && statuses.includes(u.status)).length;
  return MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    businessName: BUSINESS,
    price: m.price,
    inStock: count(m.name, 'in_stock'),
    reserved: count(m.name, 'reserved'),
    soldThisMonth: count(m.name, 'sold', 'delivered'),
  }));
}
