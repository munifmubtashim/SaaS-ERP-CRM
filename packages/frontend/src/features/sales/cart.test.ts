import { saleDraftSchema, type PosItem } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import {
  addItem,
  cartTotals,
  categoriesOf,
  changeQuantity,
  filterItems,
  pickSerial,
  removeLine,
  saleProblem,
  takaInput,
  toSaleDraft,
  type Cart,
} from './cart';

/** The POS cart, as design/owner-dashboard/Sales.dc.html behaves. Invented sample items only. */
const bike: PosItem = {
  id: 'velo-150',
  name: 'Velo 150 V3',
  category: 'Bikes',
  kind: 'serial',
  price: '245000.00',
  available: '2',
  serialNumbers: ['VL3-000101', 'VL3-000102'],
};
const pads: PosItem = {
  id: 'pads',
  name: 'Brake pad set, front',
  category: 'Parts',
  kind: 'quantity',
  price: '1000.00',
  available: '3',
  serialNumbers: [],
};

describe('adding items', () => {
  it('a counted item adds once, then raises its quantity up to the stock', () => {
    let cart: Cart = [];
    for (let i = 0; i < 5; i += 1) cart = addItem(cart, pads);
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(3);
  });

  it('a serial-tracked item gets one line per unit, never more lines than units in stock', () => {
    let cart: Cart = [];
    for (let i = 0; i < 3; i += 1) cart = addItem(cart, bike);
    expect(cart.map((line) => [line.itemId, line.quantity, line.serialNumber])).toEqual([
      ['velo-150', 1, null],
      ['velo-150', 1, null],
    ]);
  });

  it('quantity goes up to the stock and down to 1; a serial line always stays at 1', () => {
    let cart = addItem([], pads);
    cart = changeQuantity(cart, 0, +5);
    expect(cart[0]?.quantity).toBe(3);
    cart = changeQuantity(cart, 0, -10);
    expect(cart[0]?.quantity).toBe(1);
    const bikes = changeQuantity(addItem([], bike), 0, +1);
    expect(bikes[0]?.quantity).toBe(1);
  });

  it('a serial number is picked once: another line can not take the same unit', () => {
    let cart = addItem(addItem([], bike), bike);
    cart = pickSerial(cart, 0, 'VL3-000101');
    cart = pickSerial(cart, 1, 'VL3-000101');
    expect(cart.map((line) => line.serialNumber)).toEqual(['VL3-000101', null]);
    expect(removeLine(cart, 0).map((line) => line.serialNumber)).toEqual([null]);
  });
});

describe('cartTotals', () => {
  const cart = addItem(addItem(addItem([], pads), pads), bike); // 2 x 1,000 + 245,000

  it('subtotal, discount, total; paid in full by default with no change', () => {
    expect(cartTotals(cart, { discount: '5000.00', method: 'cash', received: null })).toEqual({
      subtotal: '247000.00',
      discount: '5000.00',
      total: '242000.00',
      received: '242000.00',
      paid: '242000.00',
      change: null,
      due: null,
    });
  });

  it('the discount is clamped to the subtotal and never negative', () => {
    expect(cartTotals(cart, { discount: '999999.00', method: 'cash', received: null }).total).toBe('0.00');
    expect(cartTotals(cart, { discount: '-50.00', method: 'cash', received: null }).discount).toBe('0.00');
  });

  it('more received than the total gives change; less leaves a due; Due receives nothing', () => {
    expect(cartTotals(cart, { discount: '0.00', method: 'cash', received: '250000.00' })).toMatchObject({
      paid: '247000.00',
      change: '3000.00',
      due: null,
    });
    expect(cartTotals(cart, { discount: '0.00', method: 'card', received: '100000.00' })).toMatchObject({
      paid: '100000.00',
      change: null,
      due: '147000.00',
    });
    expect(cartTotals(cart, { discount: '0.00', method: 'due', received: '5000.00' })).toMatchObject({
      received: '0.00',
      paid: '0.00',
      due: '247000.00',
    });
  });

  it('an empty cart totals zero', () => {
    expect(cartTotals([], { discount: '0.00', method: 'cash', received: null }).total).toBe('0.00');
  });
});

describe('completing a sale', () => {
  it('an empty cart, or a bike without its chassis number, can not complete', () => {
    expect(saleProblem([])).toBe('empty');
    expect(saleProblem(addItem([], bike))).toBe('serial_missing');
    expect(saleProblem(pickSerial(addItem([], bike), 0, 'VL3-000101'))).toBeNull();
  });

  it('the draft matches the shared sale shape: quantities and money as strings, payment null when nothing is paid', () => {
    const cart = pickSerial(addItem(addItem([], bike), pads), 0, 'VL3-000101');
    const paid = toSaleDraft(cart, 'Sample Customer', {
      discount: '1000.00',
      method: 'bkash',
      received: '100000.00',
    });
    expect(saleDraftSchema.parse(paid)).toEqual({
      customerName: 'Sample Customer',
      lines: [
        {
          itemId: 'velo-150',
          name: 'Velo 150 V3',
          unitPrice: '245000.00',
          quantity: '1',
          serialNumber: 'VL3-000101',
        },
        {
          itemId: 'pads',
          name: 'Brake pad set, front',
          unitPrice: '1000.00',
          quantity: '1',
          serialNumber: null,
        },
      ],
      discount: '1000.00',
      payment: { method: 'bkash', amount: '100000.00' },
    });
    const due = toSaleDraft(cart, null, { discount: '0.00', method: 'due', received: null });
    expect(due.payment).toBeNull();
    expect(due.customerName).toBeNull();
  });
});

describe('filterItems', () => {
  const items = [bike, pads, { ...pads, id: 'oil', name: 'Engine oil 4T', category: 'Oil' }];

  it('by category, then by a search in the name, without regard to case', () => {
    expect(filterItems(items, '', 'all').map((i) => i.id)).toEqual(['velo-150', 'pads', 'oil']);
    expect(filterItems(items, '', 'Parts').map((i) => i.id)).toEqual(['pads']);
    expect(filterItems(items, 'BRAKE', 'all').map((i) => i.id)).toEqual(['pads']);
    expect(filterItems(items, '  oil ', 'Parts')).toEqual([]);
  });

  it('the categories to offer: All first, then each category once, in the order items list them', () => {
    expect(categoriesOf(items)).toEqual(['all', 'Bikes', 'Parts', 'Oil']);
  });
});

describe('takaInput', () => {
  it('typed taka to a money string, without floats; anything else is null', () => {
    expect(takaInput('500')).toBe('500.00');
    expect(takaInput(' 1,250.5 ')).toBe('1250.50');
    expect(takaInput('0.05')).toBe('0.05');
    expect(takaInput('')).toBe('0.00');
    for (const bad of ['abc', '1.234', '-5', '1e3']) expect(takaInput(bad), bad).toBeNull();
  });
});
