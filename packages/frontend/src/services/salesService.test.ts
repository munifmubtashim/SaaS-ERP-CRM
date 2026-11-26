import {
  invoiceDetailSchema,
  invoiceSummarySchema,
  posItemSchema,
  postInvoiceSchema,
  type SaleDraft,
} from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { IHttpClient } from './HttpClient';
import { SampleSalesService } from './sample/SampleSalesService';
import { SalesService } from './salesService';

/** The POS calls: the counter's items, and Complete sale with an Idempotency-Key (one sale per key). */
class RecordingHttp implements IHttpClient {
  posts: { path: string; body: unknown; key: string | undefined }[] = [];
  gets: string[] = [];
  constructor(private readonly answer: unknown = null) {}
  getJson = <T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> => {
    this.gets.push(path);
    return Promise.resolve(schema.parse(this.answer));
  };
  postJson = (path: string, body: unknown, _schema: unknown, options?: { idempotencyKey?: string }) => {
    this.posts.push({ path, body, key: options?.idempotencyKey });
    return Promise.reject(new Error('no API in this test'));
  };
  post = () => Promise.reject(new Error('unused'));
}

const draft = (serial: string | null, paid: string | null): SaleDraft => ({
  customerName: 'Sample Customer',
  lines: [
    { itemId: 'velo-150', name: 'Velo 150 V3', unitPrice: '245000.00', quantity: '1', serialNumber: serial },
    { itemId: 'pads', name: 'Brake pad set, front', unitPrice: '1000.00', quantity: '2', serialNumber: null },
  ],
  discount: '5000.00',
  payment: paid ? { method: 'cash', amount: paid, externalRef: null } : null,
});

describe('SalesService (the API)', () => {
  it('invoices reads the first page of GET /v1/invoices (#221) and answers its items', async () => {
    const sample = (await new SampleSalesService(0, '2026-11-12').invoices()).slice(0, 2);
    const http = new RecordingHttp({ items: sample, nextCursor: null });
    expect(await new SalesService(http).invoices()).toEqual(sample);
    expect(http.gets).toEqual(['/v1/invoices']);
  });

  it('invoice reads GET /v1/invoices/:id by the invoice id (#221)', async () => {
    const service = new SampleSalesService(0, '2026-11-12');
    const [first] = await service.invoices();
    const detail = await service.invoice(first?.id ?? '');
    const http = new RecordingHttp(detail);
    expect(await new SalesService(http).invoice(detail.id)).toEqual(detail);
    expect(http.gets).toEqual([`/v1/invoices/${detail.id}`]);
  });

  it('recordPayment posts to the invoice’s payments, by its id, with its Idempotency-Key', async () => {
    const http = new RecordingHttp();
    const id = '0195f000-0000-7000-8000-000000000101';
    await new SalesService(http)
      .recordPayment(id, { method: 'bkash', amount: '500.00', externalRef: 'BK9' }, 'key-9')
      .catch(() => undefined);
    expect(http.posts).toEqual([
      {
        path: `/v1/invoices/${id}/payments`,
        body: { method: 'bkash', amount: '500.00', externalRef: 'BK9' },
        key: 'key-9',
      },
    ]);
  });
});

describe('SampleSalesService', () => {
  it('lists invented POS items in the shared shape', async () => {
    const items = await new SampleSalesService(0).posItems();
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) expect(posItemSchema.parse(item)).toEqual(item);
  });

  it('a sale answers with the next invoice, partly paid, and takes the stock and the unit off the list', async () => {
    const sample = new SampleSalesService(0);
    const invoice = await sample.completeSale(draft('VL3-000101', '100000.00'), 'key-1');
    expect(invoiceSummarySchema.parse(invoice)).toMatchObject({
      number: 'C-000124',
      customerName: 'Sample Customer',
      total: '242000.00',
      paid: '100000.00',
      due: '142000.00',
      status: 'posted',
      paymentStatus: 'partly_paid',
    });
    const items = await sample.posItems();
    expect(items.find((i) => i.id === 'velo-150')?.serialNumbers).not.toContain('VL3-000101');
    expect(items.find((i) => i.id === 'pads')?.available).toBe('16');
  });

  it('the same Idempotency-Key twice returns the first invoice and sells nothing again', async () => {
    const sample = new SampleSalesService(0);
    const first = await sample.completeSale(draft('VL3-000101', null), 'key-2');
    const again = await sample.completeSale(draft('VL3-000101', null), 'key-2');
    expect(again).toEqual(first);
    expect(first.paymentStatus).toBe('due');
    expect((await sample.posItems()).find((i) => i.id === 'pads')?.available).toBe('16');
  });
});

describe('SampleSalesService invoices', () => {
  const sample = () => new SampleSalesService(0, '2026-11-12');

  it('lists invented invoices in the #221 shape, dated around the given day, every payment status present', async () => {
    const list = await sample().invoices();
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (const invoice of list) expect(invoiceSummarySchema.parse(invoice)).toEqual(invoice);
    expect(new Set(list.map((i) => i.paymentStatus))).toEqual(new Set(['paid', 'partly_paid', 'due']));
    expect(list.every((i) => i.status === 'posted')).toBe(true);
    expect(list.every((i) => i.invoiceDate <= '2026-11-12')).toBe(true);
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
  });

  it('opens an invoice by its id, with its lines, payments, subtotal and due', async () => {
    const service = sample();
    const [first] = await service.invoices();
    const detail = await service.invoice(first?.id ?? '');
    expect(invoiceDetailSchema.parse(detail)).toEqual(detail);
    expect(detail.lines.length).toBeGreaterThan(0);
    expect(detail.number).toBe(first?.number);
  });

  it('a completed sale appears in the list and opens with its lines', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', '100000.00'), 'key-1');
    expect((await service.invoices()).map((i) => i.id)).toContain(sold.id);
    const detail = await service.invoice(sold.id);
    expect(detail.lines.map((l) => l.description)).toEqual([
      'Velo 150 V3, VL3-000101',
      'Brake pad set, front',
    ]);
    expect(detail).toMatchObject({
      subtotal: '247000.00',
      discount: '5000.00',
      paid: '100000.00',
      due: '142000.00',
    });
    expect(detail.payments).toEqual([
      expect.objectContaining({ method: 'cash', amount: '100000.00', externalRef: null }),
    ]);
  });

  it('a payment raises paid, lowers the due and moves the payment status; the same key twice pays once', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', '100000.00'), 'key-1');
    const part = await service.recordPayment(
      sold.id,
      { method: 'bkash', amount: '42000.00', externalRef: 'BK42' },
      'pay-1',
    );
    expect(part).toMatchObject({ paid: '142000.00', due: '100000.00', paymentStatus: 'partly_paid' });
    const again = await service.recordPayment(
      sold.id,
      { method: 'bkash', amount: '42000.00', externalRef: 'BK42' },
      'pay-1',
    );
    expect(again.paid).toBe('142000.00');
    const full = await service.recordPayment(
      sold.id,
      { method: 'cash', amount: '100000.00', externalRef: null },
      'pay-2',
    );
    expect(full).toMatchObject({ paid: '242000.00', due: '0.00', paymentStatus: 'paid' });
    expect((await service.invoices()).find((i) => i.id === sold.id)?.paymentStatus).toBe('paid');
  });

  it('a bKash payment keeps its transaction id; without one it is refused (ADR 0016 lines 20 and 104)', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', null), 'key-1');
    await expect(
      service.recordPayment(sold.id, { method: 'bkash', amount: '1000.00', externalRef: null }, 'p1'),
    ).rejects.toThrow('payment.reference_missing');
    const paid = await service.recordPayment(
      sold.id,
      { method: 'bkash', amount: '1000.00', externalRef: 'BK7X2Q9' },
      'p2',
    );
    expect(paid.payments.at(-1)).toMatchObject({ method: 'bkash', externalRef: 'BK7X2Q9' });
  });

  it('the invented invoices are paid in cash or bKash only, as the demo POS offers', async () => {
    const service = sample();
    const methods = new Set<string>();
    for (const invoice of await service.invoices())
      for (const p of (await service.invoice(invoice.id)).payments) methods.add(p.method);
    expect([...methods].sort()).toEqual(['bkash', 'cash']);
  });

  it('refuses a payment above what is due, or on an unknown invoice', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', null), 'key-1');
    await expect(
      service.recordPayment(sold.id, { method: 'cash', amount: '242000.01', externalRef: null }, 'p'),
    ).rejects.toThrow('payment.over_balance');
    await expect(service.invoice('0195f000-0000-7000-8000-999999999999')).rejects.toThrow(
      'invoice.not_found',
    );
  });

  it('every payment has a system receipt number, unique, and a new payment takes the next one (ADR 0016 line 19)', async () => {
    const service = sample();
    const receipts = async () => {
      const all: string[] = [];
      for (const invoice of await service.invoices())
        for (const p of (await service.invoice(invoice.id)).payments) all.push(p.receiptNumber);
      return all;
    };
    const before = await receipts();
    expect(before.every((r) => /^R-\d{6}$/.test(r))).toBe(true);
    expect(new Set(before).size).toBe(before.length);
    const sold = await service.completeSale(draft('VL3-000101', '100000.00'), 'key-1');
    const paid = await service.recordPayment(
      sold.id,
      { method: 'cash', amount: '1000.00', externalRef: null },
      'p1',
    );
    const [atSale, later] = paid.payments.map((p) => p.receiptNumber);
    const last = before.map((r) => Number(r.slice(2))).sort((a, b) => b - a)[0] ?? 0;
    expect(atSale).toBe(`R-${String(last + 1).padStart(6, '0')}`);
    expect(later).toBe(`R-${String(last + 2).padStart(6, '0')}`);
  });
});

/** The POS wiring (Munif, 25 Nov): GET /v1/stock/pos-catalog in, POST /v1/invoices out (#185's shapes). */
const PARTS = '0196f000-0000-7000-8000-0000000000f0';
const BIKE = '0196f000-0000-7000-8000-0000000000f2';
const UNIT = '0196f000-0000-7000-8000-0000000000a1';
const WALK_IN = '0196f000-0000-7000-8000-0000000000c0';
const catalog = {
  walkInPartyId: WALK_IN,
  items: [
    {
      productId: PARTS,
      code: 'PRT-BRK-0214',
      name: 'Brake pad set, front',
      unit: 'pcs',
      category: 'Parts',
      tracking: 'quantity',
      sellPrice: '1000.00',
      isPassThrough: false,
      onHand: '12.000',
      units: [],
    },
    {
      productId: BIKE,
      code: 'VL3-150',
      name: 'Velo 150 V3',
      unit: 'pcs',
      category: null,
      tracking: 'serial',
      sellPrice: '245000.00',
      isPassThrough: false,
      onHand: '1.000',
      units: [{ id: UNIT, serialNo: 'VL3-000101' }],
    },
  ],
};
const posted = (paid: string, due: string) => ({
  id: '0196f000-0000-7000-8000-0000000000d1',
  number: 'INV-000007',
  invoiceDate: '2026-11-25',
  partyId: WALK_IN,
  customerName: 'Sample Customer',
  subtotal: '247000.00',
  discount: '5000.00',
  total: '242000.00',
  paid,
  due,
  status: 'posted',
  lines: [],
  payments: [],
});

/** #221's GET /v1/invoices/:id for the posted invoice: what completeSale reads back. */
const readBack = (answer: ReturnType<typeof posted>) => ({
  id: answer.id,
  number: answer.number,
  branchId: '0196f000-0000-7000-8000-0000000000b1',
  partyId: answer.partyId,
  invoiceDate: answer.invoiceDate,
  issuedAt: '2026-11-25T06:40:00.000Z',
  customerName: 'Sample Customer',
  total: answer.total,
  paid: answer.paid,
  due: answer.due,
  status: 'posted',
  paymentStatus: answer.due === '0.00' ? 'paid' : answer.paid === '0.00' ? 'due' : 'partly_paid',
  soldBy: 'Sample Cashier',
  subtotal: answer.subtotal,
  discount: answer.discount,
  lines: [],
  payments: [],
});

class ApiHttp implements IHttpClient {
  gets: string[] = [];
  posts: { path: string; body: unknown; key: string | undefined }[] = [];
  constructor(private readonly answer: ReturnType<typeof posted> = posted('242000.00', '0.00')) {}
  getJson = async <T extends z.ZodType>(path: string, schema: T) => {
    this.gets.push(path);
    return schema.parse(path.startsWith('/v1/invoices/') ? readBack(this.answer) : catalog) as z.infer<T>;
  };
  postJson = async <T extends z.ZodType>(
    path: string,
    body: unknown,
    schema: T,
    options?: { idempotencyKey?: string },
  ) => {
    this.posts.push({ path, body, key: options?.idempotencyKey });
    return schema.parse(this.answer) as z.infer<T>;
  };
  post = () => Promise.reject(new Error('unused'));
}

const realDraft = (paid: SaleDraft['payment']): SaleDraft => ({
  customerName: 'Sample Customer',
  lines: [
    { itemId: BIKE, name: 'Velo 150 V3', unitPrice: '245000.00', quantity: '1', serialNumber: 'VL3-000101' },
    { itemId: PARTS, name: 'Brake pad set, front', unitPrice: '1000.00', quantity: '2', serialNumber: null },
  ],
  discount: '5000.00',
  payment: paid,
});

describe('SalesService: the POS on the real API (POST /v1/invoices, #191)', () => {
  it('posItems reads GET /v1/stock/pos-catalog: on hand, price, category (null kept), units by serial number', async () => {
    const http = new ApiHttp();
    const items = await new SalesService(http).posItems();
    expect(http.gets).toEqual(['/v1/stock/pos-catalog']);
    expect(items).toEqual([
      {
        id: PARTS,
        name: 'Brake pad set, front',
        category: 'Parts',
        kind: 'quantity',
        price: '1000.00',
        available: '12.000',
        serialNumbers: [],
      },
      {
        id: BIKE,
        name: 'Velo 150 V3',
        category: null,
        kind: 'serial',
        price: '245000.00',
        available: '1.000',
        serialNumbers: ['VL3-000101'],
      },
    ]);
    for (const item of items) expect(posItemSchema.safeParse(item).success).toBe(true);
  });

  it('completeSale posts #185 postInvoiceSchema to /v1/invoices (never /v1/sales) with the Idempotency-Key: walk-in party, unit ids, the one payment', async () => {
    const http = new ApiHttp(posted('100000.00', '142000.00'));
    const service = new SalesService(http);
    await service.posItems();
    const summary = await service.completeSale(
      realDraft({ method: 'bkash', amount: '100000.00', externalRef: 'BK7Q2' }),
      'key-1',
    );
    expect(http.posts).toEqual([
      {
        path: '/v1/invoices',
        key: 'key-1',
        body: {
          partyId: WALK_IN,
          customerName: 'Sample Customer',
          lines: [
            { productId: BIKE, serialUnitId: UNIT, qty: '1' },
            { productId: PARTS, serialUnitId: null, qty: '2' },
          ],
          discount: '5000.00',
          payments: [{ method: 'bkash', amount: '100000.00', externalRef: 'BK7Q2' }],
        },
      },
    ]);
    expect(postInvoiceSchema.safeParse(http.posts[0]?.body).success).toBe(true);
    // The answer is #221's summary, read back by the posted id: nothing in it is invented on the client.
    expect(http.gets).toEqual(['/v1/stock/pos-catalog', '/v1/invoices/0196f000-0000-7000-8000-0000000000d1']);
    expect(summary).toMatchObject({
      id: '0196f000-0000-7000-8000-0000000000d1',
      number: 'INV-000007',
      total: '242000.00',
      paid: '100000.00',
      due: '142000.00',
      status: 'posted',
      paymentStatus: 'partly_paid',
    });
    expect(invoiceSummarySchema.parse(summary)).toEqual(summary);
  });

  it('nothing received is an empty payment list and a sale that is all due', async () => {
    const http = new ApiHttp(posted('0.00', '242000.00'));
    const service = new SalesService(http);
    await service.posItems();
    const summary = await service.completeSale(realDraft(null), 'key-2');
    expect((http.posts[0]?.body as { payments: unknown[] }).payments).toEqual([]);
    expect(summary.paymentStatus).toBe('due');
  });

  it('refuses to post before the catalog is loaded (no walk-in party id yet)', async () => {
    const http = new ApiHttp();
    await expect(new SalesService(http).completeSale(realDraft(null), 'key-3')).rejects.toThrow(/catalog/);
    expect(http.posts).toEqual([]);
  });
});
