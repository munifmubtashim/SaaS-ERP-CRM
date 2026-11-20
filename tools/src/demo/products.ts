import { formatMoney, multiplyByQuantity, parseMoney } from '@erp/shared';
import type { DemoProduct } from './types.ts';

type Row = [
  code: string,
  name: string,
  brand: string | null,
  category: DemoProduct['category'],
  unit: string,
  price: string,
];

/** Invented models with fictional brands (Padma Moto, Meghna, Jamuna Motors, Karnaphuli). */
const BIKES: Row[] = [
  ['P-0001', 'Padma 100 Eco', 'Padma Moto', 'motorcycle', 'pcs', '118500.00'],
  ['P-0002', 'Padma 110 Standard', 'Padma Moto', 'motorcycle', 'pcs', '134900.00'],
  ['P-0003', 'Padma 125 Disc', 'Padma Moto', 'motorcycle', 'pcs', '156000.00'],
  ['P-0004', 'Padma 150 Street', 'Padma Moto', 'motorcycle', 'pcs', '214500.00'],
  ['P-0005', 'Meghna 110 City', 'Meghna', 'motorcycle', 'pcs', '128000.00'],
  ['P-0006', 'Meghna 125 Sport', 'Meghna', 'motorcycle', 'pcs', '162500.00'],
  ['P-0007', 'Meghna 150 Sport', 'Meghna', 'motorcycle', 'pcs', '238000.00'],
  ['P-0008', 'Jamuna 100 Classic', 'Jamuna Motors', 'motorcycle', 'pcs', '112000.00'],
  ['P-0009', 'Jamuna 125 Plus', 'Jamuna Motors', 'motorcycle', 'pcs', '149900.00'],
  ['P-0010', 'Jamuna 160 Pro', 'Jamuna Motors', 'motorcycle', 'pcs', '265000.00'],
  ['P-0011', 'Karnaphuli 110 Scooter', 'Karnaphuli', 'motorcycle', 'pcs', '142000.00'],
  ['P-0012', 'Karnaphuli 150 Tourer', 'Karnaphuli', 'motorcycle', 'pcs', '289000.00'],
];

const PARTS: Row[] = [
  ['P-0101', 'Engine oil 10W-30, 1 litre', 'Jamuna Lube', 'lubricants', 'bottle', '650.00'],
  ['P-0102', 'Engine oil 20W-40, 1 litre', 'Jamuna Lube', 'lubricants', 'bottle', '580.00'],
  ['P-0103', 'Gear oil, 500 ml', 'Jamuna Lube', 'lubricants', 'bottle', '320.00'],
  ['P-0104', 'Brake fluid DOT 4, 250 ml', null, 'lubricants', 'bottle', '280.00'],
  ['P-0105', 'Chain lubricant spray', 'Jamuna Lube', 'lubricants', 'can', '450.00'],
  ['P-0106', 'Coolant, 1 litre', null, 'lubricants', 'bottle', '390.00'],
  ['P-0201', 'Front brake pad', null, 'parts', 'set', '450.00'],
  ['P-0202', 'Rear brake shoe', null, 'parts', 'set', '380.00'],
  ['P-0203', 'Chain sprocket kit', 'Padma Moto', 'parts', 'kit', '2850.00'],
  ['P-0204', 'Drive chain', null, 'parts', 'pcs', '1450.00'],
  ['P-0205', 'Clutch plate set', 'Meghna', 'parts', 'set', '1650.00'],
  ['P-0206', 'Clutch cable', null, 'parts', 'pcs', '320.00'],
  ['P-0207', 'Throttle cable', null, 'parts', 'pcs', '290.00'],
  ['P-0208', 'Spark plug', null, 'parts', 'pcs', '250.00'],
  ['P-0209', 'Air filter', 'Padma Moto', 'parts', 'pcs', '420.00'],
  ['P-0210', 'Oil filter', 'Meghna', 'parts', 'pcs', '310.00'],
  ['P-0211', 'Battery 12V 5Ah', null, 'parts', 'pcs', '2650.00'],
  ['P-0212', 'Headlight bulb', null, 'parts', 'pcs', '260.00'],
  ['P-0213', 'Indicator lamp', null, 'parts', 'pcs', '180.00'],
  ['P-0214', 'Rear view mirror, pair', null, 'parts', 'pair', '650.00'],
  ['P-0215', 'Front tyre 2.75-17', null, 'parts', 'pcs', '2350.00'],
  ['P-0216', 'Rear tyre 3.00-17', null, 'parts', 'pcs', '2750.00'],
  ['P-0217', 'Inner tube 17 inch', null, 'parts', 'pcs', '420.00'],
  ['P-0218', 'Front shock absorber', 'Jamuna Motors', 'parts', 'pcs', '3850.00'],
  ['P-0219', 'Rear shock absorber, pair', 'Jamuna Motors', 'parts', 'pair', '4650.00'],
  ['P-0220', 'Disc brake rotor', 'Meghna', 'parts', 'pcs', '2950.00'],
  ['P-0221', 'Piston kit', 'Padma Moto', 'parts', 'kit', '3250.00'],
  ['P-0222', 'Carburettor assembly', 'Karnaphuli', 'parts', 'pcs', '4850.00'],
  ['P-0301', 'Full-face helmet, size M', 'Karnaphuli', 'accessories', 'pcs', '3250.00'],
  ['P-0302', 'Full-face helmet, size L', 'Karnaphuli', 'accessories', 'pcs', '3250.00'],
  ['P-0303', 'Open-face helmet', null, 'accessories', 'pcs', '1850.00'],
  ['P-0304', 'Riding gloves', null, 'accessories', 'pair', '650.00'],
  ['P-0305', 'Rain cover for bike', null, 'accessories', 'pcs', '850.00'],
  ['P-0306', 'Disc lock', null, 'accessories', 'pcs', '950.00'],
  ['P-0307', 'Phone holder', null, 'accessories', 'pcs', '550.00'],
  ['P-0308', 'Seat cover', null, 'accessories', 'pcs', '480.00'],
  ['P-0309', 'Leg guard', 'Padma Moto', 'accessories', 'pcs', '1650.00'],
  ['P-0310', 'Number plate frame', null, 'accessories', 'pcs', '350.00'],
];

/** Cost is 86% of price for the opening receipts, rounded once by the shared money helper. */
const toProduct = (
  [code, name, brand, category, unit, price]: Row,
  tracking: DemoProduct['tracking'],
): DemoProduct => ({
  code,
  name,
  brand,
  category,
  unit,
  tracking,
  price,
  unitCost: formatMoney(multiplyByQuantity(parseMoney(price), '0.860')),
});

/** 50 invented products: 12 serial-tracked bike models, 38 parts and accessories counted by quantity. */
export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  ...BIKES.map((r) => toProduct(r, 'serial')),
  ...PARTS.map((r) => toProduct(r, 'quantity')),
];
