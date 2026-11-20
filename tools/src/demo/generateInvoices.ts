import {
  allocate,
  formatMoney,
  multiplyByQuantity,
  parseMoney,
  subtractMoney,
  sumMoney,
  type Paisa,
} from '@erp/shared';
import { DEMO_BRANCHES } from './branches.ts';
import { DEMO_CUSTOMERS } from './customers.ts';
import { DEMO_OPENING_PART_STOCK, DEMO_UNITS } from './openingStock.ts';
import { DEMO_PRODUCTS } from './products.ts';
import { SeededRandom } from './random.ts';
import type {
  DemoClock,
  DemoProduct,
  InvoiceLineRequest,
  InvoiceRequest,
  PaymentMethod,
  PaymentRequest,
} from './types.ts';

export const FIRST_SALE_DATE = '2026-09-01';
export const LAST_SALE_DATE = '2026-11-28';
const DEFAULT_SEED = 20261129;
/** Asia/Dhaka is UTC+6 with no daylight saving since 2010. */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const REF_PREFIX: Record<Exclude<PaymentMethod, 'cash'>, string> = { bank: 'BNK', bkash: 'BK', card: 'CRD' };
const PARTIAL_SHARES = ['0.200', '0.300', '0.400', '0.500', '0.600', '0.700', '0.800'] as const;
/** Weighted branch choice: the flagship showroom sells most. */
const BRANCH_WEIGHTS: readonly [string, number][] = [
  ['MIR', 4],
  ['UTT', 3],
  ['AGR', 2],
  ['NGJ', 2],
];

const dhakaToday = (clock: DemoClock) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(clock.now());

function pickBranch(rng: SeededRandom): string {
  const total = BRANCH_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = rng.int(1, total);
  for (const [code, weight] of BRANCH_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return code;
  }
  return 'MIR';
}

function line(product: DemoProduct, qty: string, chassisNo: string | null): InvoiceLineRequest {
  return {
    productCode: product.code,
    chassisNo,
    qty,
    unitPrice: product.price,
    lineTotal: formatMoney(multiplyByQuantity(parseMoney(product.price), qty)),
  };
}

/**
 * About 300 invoice requests, 1 Sep to 28 Nov 2026, never later than the clock's date in Dhaka. Pure: the
 * same seed and clock always give the same list. Stock is respected: each chassis sells once, from its own
 * branch, and no branch sells more of a part than it holds. 70% are paid in full, the rest partly.
 */
export function generateInvoiceRequests({
  clock,
  seed = DEFAULT_SEED,
}: {
  clock: DemoClock;
  seed?: number | undefined;
}): InvoiceRequest[] {
  const rng = new SeededRandom(seed);
  const today = dhakaToday(clock);
  const last = today < LAST_SALE_DATE ? today : LAST_SALE_DATE;

  const unsold = new Map<string, string[]>(); // branch -> chassis numbers still in stock
  for (const u of DEMO_UNITS) unsold.set(u.branchCode, [...(unsold.get(u.branchCode) ?? []), u.chassisNo]);
  const unitByChassis = new Map(DEMO_UNITS.map((u) => [u.chassisNo, u]));
  const partsLeft = new Map(
    DEMO_OPENING_PART_STOCK.map((s) => [`${s.branchCode}:${s.productCode}`, Number.parseInt(s.qty, 10)]),
  );
  const productByCode = new Map(DEMO_PRODUCTS.map((p) => [p.code, p]));
  const parts = DEMO_PRODUCTS.filter((p) => p.tracking === 'quantity');
  const accessories = parts.filter((p) => p.category === 'accessories');

  const invoices: InvoiceRequest[] = [];
  for (let day = Date.parse(`${FIRST_SALE_DATE}T00:00:00Z`); ; day += DAY_MS) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (date > last) break;
    const count = rng.int(3, 4);
    const times = Array.from({ length: count }, () => rng.int(10 * 60, 19 * 60 + 59)).sort((a, b) => a - b);

    for (const minuteOfDay of times) {
      const branchCode = pickBranch(rng);
      const isMotors = DEMO_BRANCHES.find((b) => b.code === branchCode)?.business === 'Demo Motors';
      const lines: InvoiceLineRequest[] = [];

      const addPart = (product: DemoProduct, qty: number): void => {
        const key = `${branchCode}:${product.code}`;
        const left = partsLeft.get(key) ?? 0;
        if (left < qty || lines.some((l) => l.productCode === product.code)) return;
        partsLeft.set(key, left - qty);
        lines.push(line(product, `${qty}.000`, null));
      };

      const stock = unsold.get(branchCode) ?? [];
      if (isMotors && stock.length > 0 && rng.chance(0.3)) {
        const chassisNo = stock.splice(rng.int(0, stock.length - 1), 1)[0] as string;
        const unit = unitByChassis.get(chassisNo);
        const product = unit && productByCode.get(unit.productCode);
        if (product) lines.push(line(product, '1.000', chassisNo));
        if (rng.chance(0.5)) addPart(rng.pick(accessories), 1);
      } else {
        const wanted = rng.int(1, 4);
        for (let i = 0; i < wanted; i += 1) addPart(rng.pick(parts), rng.int(1, 3));
      }
      if (lines.length === 0) continue;

      const hasBike = lines.some((l) => l.chassisNo !== null);
      const subtotal = sumMoney(lines.map((l) => parseMoney(l.lineTotal)));
      const discount = hasBike && rng.chance(0.25) ? parseMoney(`${rng.int(2, 10) * 500}.00`) : (0n as Paisa);
      const total = subtractMoney(subtotal, discount);
      const n = invoices.length + 1;
      const soldAt = new Date(
        Date.parse(`${date}T00:00:00Z`) - DHAKA_OFFSET_MS + minuteOfDay * 60_000,
      ).toISOString();

      invoices.push({
        idempotencyKey: `demo-invoice-${String(n).padStart(4, '0')}`,
        soldAt,
        branchCode,
        customerCode: hasBike || rng.chance(0.6) ? rng.pick(DEMO_CUSTOMERS).code : null,
        lines,
        discount: formatMoney(discount),
        total: formatMoney(total),
        payments: payments(rng, total, hasBike, date, n),
      });
    }
  }
  return invoices;
}

function payments(
  rng: SeededRandom,
  total: Paisa,
  hasBike: boolean,
  date: string,
  n: number,
): PaymentRequest[] {
  const method = (): PaymentMethod => rng.pick(['cash', 'cash', 'bank', 'bkash', 'card'] as const);
  const ref = (m: PaymentMethod, i: number) =>
    m === 'cash'
      ? null
      : `${REF_PREFIX[m]}-${date.replaceAll('-', '')}-${String(n * 10 + i)
          .slice(-4)
          .padStart(4, '0')}`;
  const pay = (m: PaymentMethod, amount: Paisa, i: number): PaymentRequest => ({
    method: m,
    amount: formatMoney(amount),
    externalRef: ref(m, i),
  });

  if (!rng.chance(0.7)) {
    const share = multiplyByQuantity(total, rng.pick(PARTIAL_SHARES));
    return [pay(method(), share, 1)];
  }
  if (hasBike && rng.chance(0.4)) {
    const [first, second] = allocate(total, [60n, 40n] as Paisa[]);
    return [
      pay('cash', first as Paisa, 1),
      pay(rng.pick(['bank', 'bkash', 'card'] as const), second as Paisa, 2),
    ];
  }
  return [pay(method(), total, 1)];
}
