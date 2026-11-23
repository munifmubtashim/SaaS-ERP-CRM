import {
  compareMoney,
  formatMoney,
  multiplyByQuantity,
  parseMoney,
  subtractMoney,
  sumMoney,
  type InvoiceSummary,
  type PosItem,
  type SaleDraft,
} from '@erp/shared';
import type { ISalesService } from '../salesService';

/*
 * Invented POS items (no real brands, models, codes or prices). Serial-tracked items list their units' numbers;
 * every screen showing them carries the Demo data badge.
 */
const ITEMS: PosItem[] = [
  {
    id: 'velo-150',
    name: 'Velo 150 V3',
    category: 'Bikes',
    kind: 'serial',
    price: '245000.00',
    available: '3',
    serialNumbers: ['VL3-000101', 'VL3-000102', 'VL3-000103'],
  },
  {
    id: 'ridge-125',
    name: 'Ridge 125 S',
    category: 'Bikes',
    kind: 'serial',
    price: '168000.00',
    available: '2',
    serialNumbers: ['RG1-000201', 'RG1-000202'],
  },
  {
    id: 'crest-160',
    name: 'Crest 160 R',
    category: 'Bikes',
    kind: 'serial',
    price: '289000.00',
    available: '2',
    serialNumbers: ['CR6-000301', 'CR6-000302'],
  },
  {
    id: 'pads',
    name: 'Brake pad set, front',
    category: 'Parts',
    kind: 'quantity',
    price: '1000.00',
    available: '18',
    serialNumbers: [],
  },
  {
    id: 'chain-kit',
    name: 'Chain and sprocket kit',
    category: 'Parts',
    kind: 'quantity',
    price: '3200.00',
    available: '6',
    serialNumbers: [],
  },
  {
    id: 'tyre-rear',
    name: 'Rear tyre 130/70-17',
    category: 'Parts',
    kind: 'quantity',
    price: '3600.00',
    available: '0',
    serialNumbers: [],
  },
  {
    id: 'oil-1l',
    name: 'Engine oil 4T, 1 litre',
    category: 'Oil',
    kind: 'quantity',
    price: '780.00',
    available: '40',
    serialNumbers: [],
  },
  {
    id: 'helmet',
    name: 'Full-face helmet',
    category: 'Accessories',
    kind: 'quantity',
    price: '4500.00',
    available: '12',
    serialNumbers: [],
  },
  {
    id: 'mirror',
    name: 'Side mirror pair',
    category: 'Accessories',
    kind: 'quantity',
    price: '650.00',
    available: '9',
    serialNumbers: [],
  },
];

/** The POS sample behind ISalesService: development builds only (VITE_DEMO_DATA=sales). Keeps its own stock. */
export class SampleSalesService implements ISalesService {
  private items: PosItem[] = structuredClone(ITEMS);
  private next = 124;
  private readonly answered = new Map<string, InvoiceSummary>();

  constructor(private readonly delayMs = 300) {}

  private later<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), this.delayMs));
  }

  posItems = () => this.later(this.items);

  completeSale = (draft: SaleDraft, idempotencyKey: string): Promise<InvoiceSummary> => {
    const first = this.answered.get(idempotencyKey);
    if (first) return this.later(first);
    for (const line of draft.lines) {
      const item = this.items.find((i) => i.id === line.itemId);
      const short = !item || Number(item.available) < Number(line.quantity);
      const unitGone = line.serialNumber !== null && !item?.serialNumbers.includes(line.serialNumber);
      if (short || unitGone) return Promise.reject(new Error('stock.insufficient'));
    }
    const subtotal = sumMoney(
      draft.lines.map((l) => multiplyByQuantity(parseMoney(l.unitPrice), l.quantity)),
    );
    const total = subtractMoney(subtotal, parseMoney(draft.discount));
    const paid = draft.payment ? parseMoney(draft.payment.amount) : parseMoney('0.00');
    this.items = this.items.map((item) => {
      const sold = draft.lines.filter((l) => l.itemId === item.id);
      if (sold.length === 0) return item;
      const count = sold.reduce((n, l) => n + Number(l.quantity), 0);
      return {
        ...item,
        available: String(Number(item.available) - count),
        serialNumbers: item.serialNumbers.filter((s) => !sold.some((l) => l.serialNumber === s)),
      };
    });
    const invoice: InvoiceSummary = {
      number: `C-${String(this.next).padStart(6, '0')}`,
      issuedAt: new Date().toISOString(),
      customerName: draft.customerName ?? 'Walk-in customer',
      total: formatMoney(total),
      paid: formatMoney(paid),
      status:
        compareMoney(paid, total) >= 0
          ? 'paid'
          : compareMoney(paid, parseMoney('0.00')) > 0
            ? 'partly_paid'
            : 'due',
    };
    this.next += 1;
    this.answered.set(idempotencyKey, invoice);
    return this.later(invoice);
  };
}
