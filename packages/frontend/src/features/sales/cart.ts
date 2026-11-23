import {
  compareMoney,
  formatMoney,
  isNegative,
  multiplyByQuantity,
  parseMoney,
  subtractMoney,
  sumMoney,
  ZERO,
  type PosItem,
  type SaleDraft,
} from '@erp/shared';

/**
 * The POS cart (design/owner-dashboard/Sales.dc.html), as pure functions: what the counter can add, the totals, and
 * the draft Complete sale sends. Money stays a string and is computed only through the shared money helpers.
 * Provisional, like the sale shape it produces (#134): it decides nothing about how a sale posts (ADR 0022).
 */
export interface CartLine {
  itemId: string;
  name: string;
  kind: PosItem['kind'];
  unitPrice: string;
  /** A count of pieces; always 1 for a serial-tracked unit. */
  quantity: number;
  /** The unit sold, for a serial-tracked item (picked at the counter); null until picked, and for counted items. */
  serialNumber: string | null;
  /** Stock at this branch when the item was added: the most a counted line can take. */
  available: number;
}

export type Cart = readonly CartLine[];
export type PaymentChoice = 'cash' | 'card' | 'bkash' | 'due';

const stockOf = (item: PosItem) => Math.floor(Number(item.available));

/** A counted item adds once and then goes up to its stock; a serial item adds one line per unit, up to the units. */
export function addItem(cart: Cart, item: PosItem): Cart {
  const stock = stockOf(item);
  if (item.kind === 'serial') {
    const lines = cart.filter((line) => line.itemId === item.id).length;
    if (lines >= Math.min(stock, item.serialNumbers.length)) return cart;
    return [
      ...cart,
      {
        itemId: item.id,
        name: item.name,
        kind: 'serial',
        unitPrice: item.price,
        quantity: 1,
        serialNumber: null,
        available: stock,
      },
    ];
  }
  const index = cart.findIndex((line) => line.itemId === item.id);
  if (index >= 0) return changeQuantity(cart, index, +1);
  if (stock < 1) return cart;
  return [
    ...cart,
    {
      itemId: item.id,
      name: item.name,
      kind: 'quantity',
      unitPrice: item.price,
      quantity: 1,
      serialNumber: null,
      available: stock,
    },
  ];
}

/** The design's − and + buttons: between 1 and the stock; a serial line stays at 1. */
export function changeQuantity(cart: Cart, index: number, delta: number): Cart {
  return cart.map((line, i) =>
    i !== index || line.kind === 'serial'
      ? line
      : { ...line, quantity: Math.min(line.available, Math.max(1, line.quantity + delta)) },
  );
}

/** Picks the unit for a serial line; a unit already on another line can't be picked twice. */
export function pickSerial(cart: Cart, index: number, serialNumber: string): Cart {
  if (cart.some((line, i) => i !== index && line.serialNumber === serialNumber)) return cart;
  return cart.map((line, i) => (i === index && line.kind === 'serial' ? { ...line, serialNumber } : line));
}

export function removeLine(cart: Cart, index: number): Cart {
  return cart.filter((_, i) => i !== index);
}

const lineAmount = (line: CartLine) => multiplyByQuantity(parseMoney(line.unitPrice), String(line.quantity));

export interface CartTotals {
  subtotal: string;
  discount: string;
  total: string;
  received: string;
  paid: string;
  /** Received above the total: change to give back. */
  change: string | null;
  /** Total not paid now: the customer's due. */
  due: string | null;
}

/**
 * Subtotal, the discount clamped between 0 and the subtotal, the total, and what the payment covers. The amount
 * received defaults to the total; Due receives nothing (prices include VAT, as the design says).
 */
export function cartTotals(
  cart: Cart,
  { discount, method, received }: { discount: string; method: PaymentChoice; received: string | null },
): CartTotals {
  const subtotal = sumMoney(cart.map(lineAmount));
  const asked = parseMoney(discount);
  const clamped = isNegative(asked) ? ZERO : compareMoney(asked, subtotal) > 0 ? subtotal : asked;
  const total = subtractMoney(subtotal, clamped);
  const got = method === 'due' ? ZERO : received === null ? total : parseMoney(received);
  const receivedAmount = isNegative(got) ? ZERO : got;
  const paid = compareMoney(receivedAmount, total) > 0 ? total : receivedAmount;
  const change = subtractMoney(receivedAmount, total);
  const due = subtractMoney(total, paid);
  return {
    subtotal: formatMoney(subtotal),
    discount: formatMoney(clamped),
    total: formatMoney(total),
    received: formatMoney(receivedAmount),
    paid: formatMoney(paid),
    change: compareMoney(change, ZERO) > 0 ? formatMoney(change) : null,
    due: compareMoney(due, ZERO) > 0 ? formatMoney(due) : null,
  };
}

/** Why Complete sale can't run yet: nothing in the cart, or a bike without its chassis number. */
export function saleProblem(cart: Cart): 'empty' | 'serial_missing' | null {
  if (cart.length === 0) return 'empty';
  if (cart.some((line) => line.kind === 'serial' && line.serialNumber === null)) return 'serial_missing';
  return null;
}

/** The draft Complete sale sends (the shared, provisional sale shape). Payment is null when nothing is paid now. */
export function toSaleDraft(
  cart: Cart,
  customerName: string | null,
  payment: { discount: string; method: PaymentChoice; received: string | null },
): SaleDraft {
  const totals = cartTotals(cart, payment);
  return {
    customerName,
    lines: cart.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      unitPrice: line.unitPrice,
      quantity: String(line.quantity),
      serialNumber: line.serialNumber,
    })),
    discount: totals.discount,
    payment:
      payment.method === 'due' || totals.paid === '0.00'
        ? null
        : { method: payment.method, amount: totals.paid },
  };
}

/** The product list's filter: a category ('all' for every one), then a search in the name, without regard to case. */
export function filterItems(items: readonly PosItem[], search: string, category: string): PosItem[] {
  const term = search.trim().toLowerCase();
  return items.filter(
    (item) =>
      (category === 'all' || item.category === category) && (!term || item.name.toLowerCase().includes(term)),
  );
}

/** The category buttons: 'all' first, then each category once, in the order the items list them. */
export function categoriesOf(items: readonly PosItem[]): string[] {
  return ['all', ...new Set(items.map((item) => item.category))];
}
