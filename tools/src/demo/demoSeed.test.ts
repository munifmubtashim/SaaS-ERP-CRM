import { MONEY_PATTERN, parseMoney, subtractMoney, sumMoney, formatMoney } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { DEMO_BRANCHES } from './branches.ts';
import { DEMO_CUSTOMERS } from './customers.ts';
import { generateInvoiceRequests, LAST_SALE_DATE, FIRST_SALE_DATE } from './generateInvoices.ts';
import { DEMO_PRODUCTS } from './products.ts';
import { DEMO_UNITS, DEMO_OPENING_PART_STOCK } from './openingStock.ts';
import type { DemoClock, InvoiceRequest } from './types.ts';

const fixedClock = (iso: string): DemoClock => ({ now: () => new Date(iso) });
const AFTER_DEMO = fixedClock('2026-11-29T04:00:00.000Z');
const run = (seed?: number, clock: DemoClock = AFTER_DEMO) => generateInvoiceRequests({ clock, seed });
const money = (s: string) => parseMoney(s);
const dhakaDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(iso));

describe('demo catalogue, branches and customers', () => {
  it('has 50 products: 12 serial-tracked bike models and 38 parts and accessories, unique codes', () => {
    expect(DEMO_PRODUCTS).toHaveLength(50);
    expect(DEMO_PRODUCTS.filter((p) => p.tracking === 'serial')).toHaveLength(12);
    expect(DEMO_PRODUCTS.filter((p) => p.tracking === 'quantity')).toHaveLength(38);
    expect(new Set(DEMO_PRODUCTS.map((p) => p.code)).size).toBe(50);
  });

  it('has 4 branches: three in Demo Motors, Narayanganj in Demo Parts', () => {
    expect(DEMO_BRANCHES.map((b) => [b.name, b.business])).toEqual([
      ['Mirpur-10', 'Demo Motors'],
      ['Uttara', 'Demo Motors'],
      ['Agrabad', 'Demo Motors'],
      ['Narayanganj', 'Demo Parts'],
    ]);
  });

  it('has 30 customers with unique codes, Bangla names on about half, phones only in the fake range', () => {
    expect(DEMO_CUSTOMERS).toHaveLength(30);
    expect(new Set(DEMO_CUSTOMERS.map((c) => c.code)).size).toBe(30);
    const withBangla = DEMO_CUSTOMERS.filter((c) => c.nameBn !== null).length;
    expect(withBangla).toBeGreaterThanOrEqual(12);
    expect(withBangla).toBeLessThanOrEqual(18);
    for (const c of DEMO_CUSTOMERS) expect(c.phone).toMatch(/^\+88017000000\d{2}$/);
    expect(new Set(DEMO_CUSTOMERS.map((c) => c.phone)).size).toBe(30);
  });

  it('prices every product as a two-decimal money string', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(typeof p.price).toBe('string');
      expect(p.price).toMatch(MONEY_PATTERN);
      expect(typeof p.unitCost).toBe('string');
      expect(p.unitCost).toMatch(MONEY_PATTERN);
    }
  });
});

describe('opening stock', () => {
  it('gives every bike unit a unique DMO-CH chassis number, in a Demo Motors branch, of a serial product', () => {
    const chassis = DEMO_UNITS.map((u) => u.chassisNo);
    expect(new Set(chassis).size).toBe(chassis.length);
    expect(DEMO_UNITS.length).toBeGreaterThanOrEqual(100);
    const motors = new Set(DEMO_BRANCHES.filter((b) => b.business === 'Demo Motors').map((b) => b.code));
    const serial = new Set(DEMO_PRODUCTS.filter((p) => p.tracking === 'serial').map((p) => p.code));
    for (const u of DEMO_UNITS) {
      expect(u.chassisNo).toMatch(/^DMO-CH-\d{6}$/);
      expect(motors.has(u.branchCode)).toBe(true);
      expect(serial.has(u.productCode)).toBe(true);
    }
  });

  it('holds part stock as three-decimal quantity strings, never for a bike', () => {
    const serial = new Set(DEMO_PRODUCTS.filter((p) => p.tracking === 'serial').map((p) => p.code));
    for (const s of DEMO_OPENING_PART_STOCK) {
      expect(s.qty).toMatch(/^\d+\.\d{3}$/);
      expect(serial.has(s.productCode)).toBe(false);
    }
  });
});

describe('generateInvoiceRequests', () => {
  it('is deterministic: the same seed and clock give the same output; another seed differs', () => {
    expect(run()).toEqual(run());
    expect(run(7)).not.toEqual(run());
  });

  it('produces about 300 invoices between 1 Sep and 28 Nov 2026 (Dhaka dates), in date order', () => {
    const invoices = run();
    expect(invoices.length).toBeGreaterThanOrEqual(270);
    expect(invoices.length).toBeLessThanOrEqual(330);
    for (const inv of invoices) {
      const day = dhakaDate(inv.soldAt);
      expect(day >= FIRST_SALE_DATE && day <= LAST_SALE_DATE, inv.soldAt).toBe(true);
    }
    const times = invoices.map((i) => i.soldAt);
    expect([...times].sort()).toEqual(times);
  });

  it('never dates a sale after the clock: a seed run on 15 Oct stops at 15 Oct', () => {
    const invoices = run(undefined, fixedClock('2026-10-15T10:00:00.000Z'));
    expect(invoices.length).toBeGreaterThan(0);
    for (const inv of invoices) expect(dhakaDate(inv.soldAt) <= '2026-10-15').toBe(true);
  });

  it('sells each chassis at most once, only from its own branch, and never a bike in Demo Parts', () => {
    const units = new Map(DEMO_UNITS.map((u) => [u.chassisNo, u]));
    const sold = run().flatMap((inv) => inv.lines.filter((l) => l.chassisNo).map((l) => ({ inv, l })));
    expect(sold.length).toBeGreaterThan(50);
    const chassis = sold.map(({ l }) => l.chassisNo);
    expect(new Set(chassis).size).toBe(chassis.length);
    for (const { inv, l } of sold) {
      const unit = units.get(l.chassisNo as string);
      expect(unit?.branchCode).toBe(inv.branchCode);
      expect(unit?.productCode).toBe(l.productCode);
      expect(l.qty).toBe('1.000');
    }
  });

  it('never sells more of a part than the branch holds', () => {
    const left = new Map(
      DEMO_OPENING_PART_STOCK.map((s) => [
        `${s.branchCode}:${s.productCode}`,
        BigInt(s.qty.replace('.', '')),
      ]),
    );
    for (const inv of run()) {
      for (const l of inv.lines.filter((x) => !x.chassisNo)) {
        const key = `${inv.branchCode}:${l.productCode}`;
        const after = (left.get(key) ?? 0n) - BigInt(l.qty.replace('.', ''));
        expect(after >= 0n, key).toBe(true);
        left.set(key, after);
      }
    }
  });

  it('keeps all money as two-decimal strings that add up: lines, discount, total, payments', () => {
    for (const inv of run()) {
      const all = [
        inv.discount,
        ...inv.lines.flatMap((l) => [l.unitPrice, l.lineTotal]),
        ...inv.payments.map((p) => p.amount),
      ];
      for (const m of all) {
        expect(typeof m).toBe('string');
        expect(m).toMatch(MONEY_PATTERN);
      }
      const subtotal = sumMoney(inv.lines.map((l) => money(l.lineTotal)));
      expect(formatMoney(subtractMoney(subtotal, money(inv.discount)))).toBe(inv.total);
    }
  });

  it('pays about 70% in full; the rest are partly paid (more than zero, less than the total)', () => {
    const invoices = run();
    const paid = (inv: InvoiceRequest) => sumMoney(inv.payments.map((p) => money(p.amount)));
    const full = invoices.filter((inv) => paid(inv) === money(inv.total));
    const ratio = full.length / invoices.length;
    expect(ratio).toBeGreaterThan(0.62);
    expect(ratio).toBeLessThan(0.78);
    for (const inv of invoices.filter((i) => !full.includes(i))) {
      expect(paid(inv) > 0n).toBe(true);
      expect(paid(inv) < money(inv.total)).toBe(true);
    }
  });

  it('mixes cash, bank, bKash and card; non-cash payments carry an external reference, cash none', () => {
    const payments = run().flatMap((inv) => inv.payments);
    expect(new Set(payments.map((p) => p.method))).toEqual(new Set(['cash', 'bank', 'bkash', 'card']));
    for (const p of payments) {
      if (p.method === 'cash') expect(p.externalRef).toBeNull();
      else expect(p.externalRef).toMatch(/^[A-Z]{2,3}-\d{8}-\d{4}$/);
    }
  });

  it('gives every invoice a unique, stable idempotency key and names a known customer or a walk-in', () => {
    const invoices = run();
    expect(new Set(invoices.map((i) => i.idempotencyKey)).size).toBe(invoices.length);
    const codes = new Set(DEMO_CUSTOMERS.map((c) => c.code));
    for (const inv of invoices) {
      if (inv.customerCode !== null) expect(codes.has(inv.customerCode)).toBe(true);
      if (inv.lines.some((l) => l.chassisNo)) expect(inv.customerCode).not.toBeNull();
    }
  });
});
