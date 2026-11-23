import { invoiceSummarySchema, posItemSchema, type SaleDraft } from '@erp/shared';
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
