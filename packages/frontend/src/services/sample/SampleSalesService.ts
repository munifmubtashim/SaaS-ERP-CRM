import {
  compareMoney,
  formatMoney,
  invoiceSummarySchema,
  multiplyByQuantity,
  parseMoney,
  subtractMoney,
  sumMoney,
  todayBD,
  addDaysISO,
  ZERO,
  type InvoiceDetail,
  type InvoiceListResponse,
  type InvoiceSummary,
  type PosItem,
  type SaleDraft,
} from '@erp/shared';
import type { ISalesService, PayableInvoice, PaymentDraft } from '../salesService';

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

type Payment = InvoiceDetail['payments'][number];

/** Invented system receipt numbers ("R-000201"); the real ones come from the number series (ADR 0015). */
const FIRST_RECEIPT = 201;
const receiptNo = (n: number) => `R-${String(n).padStart(6, '0')}`;

/*
 * Invented ids in #221's uuid shape. An invoice's id and its customer's id both follow from the invoice number
 * (C-000123 gives …-000000000123), so a sample invoice opens by id the way the real GET /v1/invoices/:id does.
 */
const SAMPLE_BRANCH_ID = '0195f000-0000-7000-8000-00000000b001';
const WALK_IN_PARTY_ID = '0195f000-0000-7000-8000-00000000a000';
const sampleId = (group: string, number: string) =>
  `0195f000-0000-7000-${group}-${number.replace(/\D/g, '').padStart(12, '0')}`;

/** A typed quantity ("2", "1.5") as #221's three-decimal string ("2.000", "1.500"), by text rules, never a float. */
const quantity3 = (typed: string) => {
  const [whole = '0', fraction = ''] = typed.split('.');
  return `${whole}.${fraction.padEnd(3, '0')}`;
};

type Unsettled = Omit<InvoiceDetail, 'subtotal' | 'total' | 'paid' | 'due' | 'paymentStatus'>;

/** A detail's subtotal, total, paid, due and payment status, from its lines, discount and payments. */
function settle(invoice: Unsettled): InvoiceDetail {
  const subtotal = sumMoney(invoice.lines.map((l) => parseMoney(l.amount)));
  const total = subtractMoney(subtotal, parseMoney(invoice.discount));
  const paid = sumMoney(invoice.payments.map((p) => parseMoney(p.amount)));
  return {
    ...invoice,
    subtotal: formatMoney(subtotal),
    total: formatMoney(total),
    paid: formatMoney(paid),
    due: formatMoney(subtractMoney(total, paid)),
    paymentStatus:
      compareMoney(paid, total) >= 0 ? 'paid' : compareMoney(paid, ZERO) > 0 ? 'partly_paid' : 'due',
  };
}

/** The header the sample builds a detail from: the ids and dates #221 adds, for a posted invoice. */
function header(number: string, issuedAt: string, customerName: string, walkIn: boolean) {
  return {
    id: sampleId('8000', number),
    number,
    branchId: SAMPLE_BRANCH_ID,
    partyId: walkIn ? WALK_IN_PARTY_ID : sampleId('8001', number),
    invoiceDate: todayBD(issuedAt),
    issuedAt,
    customerName,
    status: 'posted' as const,
  };
}

/** The list row of a detail: #221's summary schema drops the detail's keys, as the API does. */
const summary = (detail: InvoiceDetail): InvoiceSummary => invoiceSummarySchema.parse(detail);

/** Invented invoices around `today` (Dhaka, "YYYY-MM-DD"): names, items and amounts are made up. */
function seedInvoices(today: string): InvoiceDetail[] {
  const at = (daysAgo: number, time: string) => `${addDaysISO(today, -daysAgo)}T${time}:00.000Z`;
  const line = (description: string, quantity: string, unitPrice: string) => ({
    description,
    quantity: quantity3(quantity),
    unitPrice,
    amount: formatMoney(multiplyByQuantity(parseMoney(unitPrice), quantity)),
  });
  // Cash or bKash only, as the demo POS offers; a bKash payment carries its (invented) transaction id. Each payment
  // takes the next system receipt number (ADR 0016 line 19), in the order the payments are listed here.
  let receipt = FIRST_RECEIPT;
  const pay = (
    receivedAt: string,
    method: 'cash' | 'bkash',
    amount: string,
    externalRef: string | null = null,
  ) => ({
    receivedAt,
    receiptNumber: receiptNo(receipt++),
    method,
    amount,
    externalRef,
  });
  const make = (
    number: string,
    issuedAt: string,
    customerName: string,
    lines: InvoiceDetail['lines'],
    discount: string,
    payments: Payment[],
  ) =>
    settle({
      ...header(number, issuedAt, customerName, customerName === 'Walk-in customer'),
      soldBy: 'Sample Cashier',
      lines,
      discount,
      payments,
    });
  return [
    make(
      'C-000123',
      at(0, '06:40'),
      'Sample Traders',
      [line('Velo 150 V3, VL3-000099', '1', '245000.00'), line('Full-face helmet', '2', '4500.00')],
      '0.00',
      [pay(at(0, '06:42'), 'bkash', '254000.00', 'BK8A2K4M1P')],
    ),
    make(
      'C-000122',
      at(0, '05:15'),
      'Sample Customer One',
      [line('Ridge 125 S, RG1-000199', '1', '168000.00')],
      '3000.00',
      [pay(at(0, '05:16'), 'cash', '100000.00')],
    ),
    make(
      'C-000121',
      at(0, '04:05'),
      'Walk-in customer',
      [line('Brake pad set, front', '2', '1000.00'), line('Engine oil, 1 litre', '3', '650.00')],
      '0.00',
      [pay(at(0, '04:06'), 'bkash', '3950.00', 'BK3J9Q2W7Z')],
    ),
    make(
      'C-000120',
      at(1, '09:30'),
      'Sample Auto Centre',
      [line('Chain and sprocket kit', '4', '3200.00')],
      '800.00',
      [],
    ),
    make(
      'C-000119',
      at(1, '07:20'),
      'Sample Enterprise',
      [line('Crest 160 R, CR6-000299', '1', '289000.00')],
      '5000.00',
      [pay(at(1, '07:25'), 'bkash', '200000.00', 'BK5T1R8N3D'), pay(at(0, '03:30'), 'cash', '84000.00')],
    ),
    make(
      'C-000118',
      at(2, '10:10'),
      'Sample Customer Two',
      [line('Full-face helmet', '1', '4500.00')],
      '0.00',
      [pay(at(2, '10:11'), 'cash', '4500.00')],
    ),
    make(
      'C-000117',
      at(3, '08:45'),
      'Sample Riders Club',
      [line('Velo 150 V3, VL3-000098', '1', '245000.00')],
      '0.00',
      [],
    ),
  ];
}

/**
 * The POS sample behind ISalesService: development builds only (VITE_DEMO_DATA=sales). Keeps its own stock and
 * invoices. `today` fixes the day for tests; left out, the invoices are dated around today in Dhaka.
 */
export class SampleSalesService implements ISalesService {
  private items: PosItem[] = structuredClone(ITEMS);
  private next = 124;
  private readonly answered = new Map<string, InvoiceSummary>();
  private readonly paymentsAnswered = new Map<string, InvoiceDetail>();
  /** The next system receipt number: one past the highest the invented invoices used. */
  private nextReceipt = 0;
  private details: InvoiceDetail[];

  constructor(
    private readonly delayMs = 300,
    today: string | null = null,
    /** Invoices per page, like the API's cursor pages (25 by default); tests page with fewer. */
    private readonly pageSize = 25,
  ) {
    this.details = seedInvoices(today ?? todayBD(new Date().toISOString()));
    const used = this.details.flatMap((d) => d.payments.map((p) => Number(p.receiptNumber.slice(2))));
    this.nextReceipt = Math.max(FIRST_RECEIPT - 1, ...used) + 1;
  }

  private later<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), this.delayMs));
  }

  posItems = () => this.later(this.items);

  /** A page of invoices, newest first. The cursor is the offset of the next page, as text (opaque to callers). */
  invoices = (cursor: string | null): Promise<InvoiceListResponse> => {
    const from = cursor === null ? 0 : Number(cursor);
    const to = from + this.pageSize;
    return this.later({
      items: this.details.slice(from, to).map(summary),
      nextCursor: to < this.details.length ? String(to) : null,
    });
  };

  invoice = (id: string) => {
    const found = this.details.find((d) => d.id === id);
    return found ? this.later(found) : Promise.reject(new Error('invoice.not_found'));
  };

  recordPayment = (
    invoice: PayableInvoice,
    payment: PaymentDraft,
    idempotencyKey: string,
  ): Promise<InvoiceDetail> => {
    const first = this.paymentsAnswered.get(idempotencyKey);
    if (first) return this.later(first);
    const found = this.details.find((d) => d.id === invoice.id);
    if (!found) return Promise.reject(new Error('invoice.not_found'));
    const amount = parseMoney(payment.amount);
    if (compareMoney(amount, ZERO) <= 0) return Promise.reject(new Error('payment.not_positive'));
    if (payment.method !== 'cash' && !payment.externalRef)
      return Promise.reject(new Error('payment.reference_missing'));
    if (compareMoney(amount, parseMoney(found.due)) > 0)
      return Promise.reject(new Error('payment.over_balance'));
    const updated = settle({
      ...found,
      payments: [
        ...found.payments,
        { receivedAt: new Date().toISOString(), receiptNumber: receiptNo(this.nextReceipt++), ...payment },
      ],
    });
    this.details = this.details.map((d) => (d.id === invoice.id ? updated : d));
    this.paymentsAnswered.set(idempotencyKey, updated);
    return this.later(updated);
  };

  completeSale = (draft: SaleDraft, idempotencyKey: string): Promise<InvoiceSummary> => {
    const first = this.answered.get(idempotencyKey);
    if (first) return this.later(first);
    for (const line of draft.lines) {
      const item = this.items.find((i) => i.id === line.itemId);
      const short = !item || Number(item.available) < Number(line.quantity);
      const unitGone = line.serialNumber !== null && !item?.serialNumbers.includes(line.serialNumber);
      if (short || unitGone) return Promise.reject(new Error('stock.insufficient'));
    }
    const lines = draft.lines.map((l) => ({
      description: l.serialNumber ? `${l.name}, ${l.serialNumber}` : l.name,
      quantity: quantity3(l.quantity),
      unitPrice: l.unitPrice,
      amount: formatMoney(multiplyByQuantity(parseMoney(l.unitPrice), l.quantity)),
    }));
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
    const now = new Date().toISOString();
    const detail = settle({
      ...header(
        `C-${String(this.next).padStart(6, '0')}`,
        now,
        draft.customerName ?? 'Walk-in customer',
        draft.customerName === null,
      ),
      soldBy: 'Sample Cashier',
      lines,
      discount: draft.discount,
      payments: draft.payment
        ? [{ receivedAt: now, receiptNumber: receiptNo(this.nextReceipt++), ...draft.payment }]
        : [],
    });
    this.next += 1;
    this.details = [detail, ...this.details];
    const invoice = summary(detail);
    this.answered.set(idempotencyKey, invoice);
    return this.later(invoice);
  };
}
