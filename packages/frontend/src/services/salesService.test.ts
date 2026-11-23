import { invoiceDetailSchema, invoiceSummarySchema, posItemSchema, type SaleDraft } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IHttpClient } from './HttpClient';
import { SampleSalesService } from './sample/SampleSalesService';
import { SalesService } from './salesService';

/** The POS calls: the counter's items, and Complete sale with an Idempotency-Key (one sale per key). */
class RecordingHttp implements IHttpClient {
  posts: { path: string; body: unknown; key: string | undefined }[] = [];
  getJson = () => Promise.reject(new Error('unused'));
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
  payment: paid ? { method: 'cash', amount: paid } : null,
});

describe('SalesService (the API)', () => {
  it('completeSale posts the draft to /v1/sales with its Idempotency-Key', async () => {
    const http = new RecordingHttp();
    await new SalesService(http)
      .completeSale(draft('VL3-000101', '100000.00'), 'key-1')
      .catch(() => undefined);
    expect(http.posts).toEqual([{ path: '/v1/sales', body: draft('VL3-000101', '100000.00'), key: 'key-1' }]);
  });

  it('recordPayment posts to the invoice’s payments with its Idempotency-Key', async () => {
    const http = new RecordingHttp();
    await new SalesService(http)
      .recordPayment('C-000101', { method: 'bkash', amount: '500.00' }, 'key-9')
      .catch(() => undefined);
    expect(http.posts).toEqual([
      { path: '/v1/invoices/C-000101/payments', body: { method: 'bkash', amount: '500.00' }, key: 'key-9' },
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
      status: 'partly_paid',
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
    expect(first.status).toBe('due');
    expect((await sample.posItems()).find((i) => i.id === 'pads')?.available).toBe('16');
  });
});

describe('SampleSalesService invoices', () => {
  const sample = () => new SampleSalesService(0, '2026-11-12');

  it('lists invented invoices in the shared shape, dated around the given day, every status present', async () => {
    const list = await sample().invoices();
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (const invoice of list) expect(invoiceSummarySchema.parse(invoice)).toEqual(invoice);
    expect(new Set(list.map((i) => i.status))).toEqual(new Set(['paid', 'partly_paid', 'due']));
    expect(list.every((i) => i.issuedAt.slice(0, 10) <= '2026-11-12')).toBe(true);
  });

  it('opens an invoice with its lines, payments and balance', async () => {
    const service = sample();
    const [first] = await service.invoices();
    const detail = await service.invoice(first?.number ?? '');
    expect(invoiceDetailSchema.parse(detail)).toEqual(detail);
    expect(detail.lines.length).toBeGreaterThan(0);
  });

  it('a completed sale appears in the list and opens with its lines', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', '100000.00'), 'key-1');
    expect((await service.invoices()).map((i) => i.number)).toContain(sold.number);
    const detail = await service.invoice(sold.number);
    expect(detail.lines.map((l) => l.description)).toEqual([
      'Velo 150 V3, VL3-000101',
      'Brake pad set, front',
    ]);
    expect(detail).toMatchObject({ discount: '5000.00', paid: '100000.00', balance: '142000.00' });
    expect(detail.payments).toEqual([expect.objectContaining({ method: 'cash', amount: '100000.00' })]);
  });

  it('a payment raises paid, lowers the balance and moves the status; the same key twice pays once', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', '100000.00'), 'key-1');
    const part = await service.recordPayment(sold.number, { method: 'card', amount: '42000.00' }, 'pay-1');
    expect(part).toMatchObject({ paid: '142000.00', balance: '100000.00', status: 'partly_paid' });
    const again = await service.recordPayment(sold.number, { method: 'card', amount: '42000.00' }, 'pay-1');
    expect(again.paid).toBe('142000.00');
    const full = await service.recordPayment(sold.number, { method: 'bkash', amount: '100000.00' }, 'pay-2');
    expect(full).toMatchObject({ paid: '242000.00', balance: '0.00', status: 'paid' });
    expect((await service.invoices()).find((i) => i.number === sold.number)?.status).toBe('paid');
  });

  it('refuses a payment above the balance, or on an unknown invoice', async () => {
    const service = sample();
    const sold = await service.completeSale(draft('VL3-000101', null), 'key-1');
    await expect(
      service.recordPayment(sold.number, { method: 'cash', amount: '242000.01' }, 'p'),
    ).rejects.toThrow('payment.over_balance');
    await expect(service.invoice('C-999999')).rejects.toThrow('invoice.not_found');
  });
});
