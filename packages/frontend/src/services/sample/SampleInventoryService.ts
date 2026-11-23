import {
  addDaysISO,
  formatMoney,
  multiplyByQuantity,
  parseMoney,
  todayBD,
  type StockItem,
  type StockItemDetail,
  type StockMovement,
} from '@erp/shared';
import type { IInventoryService } from '../inventoryService';

/**
 * The design's stock status rule, standing in for the backend's: out when nothing is on hand, low when what is free
 * (on hand less reserved) is at or below the reorder level, otherwise in stock. Quantities are counts, not money.
 */
export function stockStatus(
  item: Pick<StockItem, 'onHand' | 'reserved' | 'reorderLevel'>,
): StockItem['status'] {
  const onHand = Number(item.onHand);
  if (onHand <= 0) return 'out';
  return onHand - Number(item.reserved) <= Number(item.reorderLevel) ? 'low' : 'in_stock';
}

const BRANCHES = [
  { branchId: 'b-mirpur', branchName: 'Mirpur-10' },
  { branchId: 'b-uttara', branchName: 'Uttara' },
  { branchId: 'b-narayanganj', branchName: 'Narayanganj' },
  { branchId: 'b-agrabad', branchName: 'Agrabad' },
];

/** Invented parts and accessories (no real brands, codes or prices): stock at each of the four sample branches. */
const ITEMS: {
  id: string;
  name: string;
  sku: string;
  category: string;
  cost: string;
  reorder: number;
  reserved: number;
  perBranch: number[];
}[] = [
  {
    id: 'oil',
    name: 'Engine oil 4T, 1 litre',
    sku: 'PRT-OIL-0101',
    category: 'Parts',
    cost: '520.00',
    reorder: 40,
    reserved: 6,
    perBranch: [64, 22, 18, 30],
  },
  {
    id: 'pads',
    name: 'Brake pad set, front',
    sku: 'PRT-BRK-0202',
    category: 'Parts',
    cost: '640.00',
    reorder: 30,
    reserved: 2,
    perBranch: [12, 8, 6, 4],
  },
  {
    id: 'tyre',
    name: 'Rear tyre 130/70-17',
    sku: 'PRT-TYR-0303',
    category: 'Parts',
    cost: '2900.00',
    reorder: 8,
    reserved: 0,
    perBranch: [0, 0, 0, 0],
  },
  {
    id: 'chain',
    name: 'Chain and sprocket kit',
    sku: 'PRT-CHN-0404',
    category: 'Parts',
    cost: '2300.00',
    reorder: 10,
    reserved: 1,
    perBranch: [6, 4, 3, 2],
  },
  {
    id: 'plug',
    name: 'Spark plug, iridium',
    sku: 'PRT-SPK-0505',
    category: 'Parts',
    cost: '410.00',
    reorder: 25,
    reserved: 0,
    perBranch: [9, 5, 4, 3],
  },
  {
    id: 'filter',
    name: 'Air filter element',
    sku: 'PRT-AIR-0606',
    category: 'Parts',
    cost: '350.00',
    reorder: 20,
    reserved: 0,
    perBranch: [3, 2, 0, 1],
  },
  {
    id: 'helmet',
    name: 'Full-face helmet',
    sku: 'ACC-HLM-0707',
    category: 'Accessories',
    cost: '3100.00',
    reorder: 12,
    reserved: 2,
    perBranch: [10, 6, 5, 4],
  },
  {
    id: 'mirror',
    name: 'Side mirror pair',
    sku: 'ACC-MIR-0808',
    category: 'Accessories',
    cost: '420.00',
    reorder: 10,
    reserved: 0,
    perBranch: [14, 9, 8, 7],
  },
  {
    id: 'cover',
    name: 'Bike cover, waterproof',
    sku: 'ACC-CVR-0909',
    category: 'Accessories',
    cost: '900.00',
    reorder: 6,
    reserved: 0,
    perBranch: [4, 3, 2, 2],
  },
];

function toDetail(item: (typeof ITEMS)[number]): StockItemDetail {
  const onHand = String(item.perBranch.reduce((n, q) => n + q, 0));
  const row = { onHand, reserved: String(item.reserved), reorderLevel: String(item.reorder) };
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    ...row,
    status: stockStatus(row),
    valueAtCost: formatMoney(multiplyByQuantity(parseMoney(item.cost), onHand)),
    byBranch: BRANCHES.map((b, i) => ({ ...b, onHand: String(item.perBranch[i] ?? 0) })),
    unitCost: item.cost,
  };
}

/** Invented movements around `today`: sales, deliveries and adjustments (no transfers in the demo, ADR 0054). */
function seedMovements(today: string): StockMovement[] {
  const at = (daysAgo: number, time: string) => `${addDaysISO(today, -daysAgo)}T${time}:00.000Z`;
  const move = (
    id: string,
    when: string,
    itemId: string,
    branch: number,
    type: StockMovement['type'],
    quantityDelta: string,
    reference: string,
    by: string,
  ): StockMovement => ({
    id,
    at: when,
    itemName: ITEMS.find((i) => i.id === itemId)?.name ?? itemId,
    branchName: BRANCHES[branch]?.branchName ?? '',
    type,
    quantityDelta,
    reference,
    by,
  });
  return [
    move('m12', at(0, '06:41'), 'helmet', 0, 'sale', '-2', 'C-000123', 'Sample Cashier'),
    move('m11', at(0, '04:06'), 'pads', 0, 'sale', '-2', 'C-000121', 'Sample Cashier'),
    move('m10', at(0, '04:06'), 'oil', 0, 'sale', '-3', 'C-000121', 'Sample Cashier'),
    move('m09', at(1, '09:31'), 'chain', 1, 'sale', '-4', 'C-000120', 'Sample Cashier'),
    move('m08', at(1, '05:00'), 'oil', 1, 'purchase', '24', 'P-000045', 'Sample Storekeeper'),
    move('m07', at(2, '10:12'), 'helmet', 2, 'sale', '-1', 'C-000118', 'Sample Cashier'),
    move('m06', at(2, '08:30'), 'tyre', 3, 'adjustment', '-1', 'ADJ-000012', 'Sample Storekeeper'),
    move('m05', at(3, '07:15'), 'plug', 0, 'purchase', '12', 'P-000044', 'Sample Storekeeper'),
    move('m04', at(4, '11:40'), 'filter', 2, 'adjustment', '-2', 'ADJ-000011', 'Sample Storekeeper'),
    move('m03', at(5, '06:20'), 'mirror', 0, 'sale', '-1', 'C-000109', 'Sample Cashier'),
    move('m02', at(6, '05:45'), 'cover', 1, 'purchase', '6', 'P-000043', 'Sample Storekeeper'),
    move('m01', at(7, '09:05'), 'pads', 3, 'sale', '-1', 'C-000101', 'Sample Cashier'),
  ];
}

/**
 * The Inventory sample behind IInventoryService: development builds only (VITE_DEMO_DATA=inventory). `today` fixes
 * the day for tests; left out, the movements are dated around today in Dhaka.
 */
export class SampleInventoryService implements IInventoryService {
  private readonly details = ITEMS.map(toDetail);
  private readonly moves: StockMovement[];

  constructor(
    private readonly delayMs = 300,
    today: string | null = null,
  ) {
    this.moves = seedMovements(today ?? todayBD(new Date().toISOString()));
  }

  private later<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), this.delayMs));
  }

  stockItems = () => this.later(this.details.map(({ byBranch: _b, unitCost: _c, ...row }) => row));

  stockItem = (id: string) => {
    const found = this.details.find((d) => d.id === id);
    return found ? this.later(found) : Promise.reject(new Error('stock.item_not_found'));
  };

  movements = (itemId?: string) => {
    const name = itemId ? this.details.find((d) => d.id === itemId)?.name : undefined;
    return this.later(this.moves.filter((m) => !itemId || m.itemName === name));
  };
}
