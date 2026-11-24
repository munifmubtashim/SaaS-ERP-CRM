import { salesPaymentSchema, type RecordPaymentInput } from '@erp/shared';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { IHttpClient } from './HttpClient';
import { SalesPaymentService } from './salesPaymentService';
import { SampleSalesPaymentService } from './sample/SampleSalesPaymentService';

/** POST /v1/payments (ADR 0057, frontend-wiring.md "Customer payments"). Every value is invented. */
const PARTY = '0196f000-0000-7000-8000-000000000101';
const INVOICE = '0196f000-0000-7000-8000-000000000201';
const payment: RecordPaymentInput = {
  partyId: PARTY,
  invoiceId: INVOICE,
  method: 'bkash',
  amount: '1500.00',
  externalRef: 'BK7X2Q9',
  note: null,
};

class RecordingHttp implements IHttpClient {
  posts: { path: string; body: unknown; schema: z.ZodType; options?: { idempotencyKey?: string } }[] = [];
  getJson = () => Promise.reject(new Error('unused'));
  postJson = <T extends z.ZodType>(
    path: string,
    body: unknown,
    schema: T,
    options?: { idempotencyKey?: string },
  ) => {
    this.posts.push({ path, body, schema, options });
    return Promise.reject(new Error('no API in this test'));
  };
  post = () => Promise.reject(new Error('unused'));
}

describe('SalesPaymentService (the API)', () => {
  it('posts the payment to /v1/payments with its Idempotency-Key and parses the answer as salesPaymentSchema', async () => {
    const http = new RecordingHttp();
    await new SalesPaymentService(http).recordPayment(payment, 'key-1').catch(() => undefined);
    expect(http.posts).toEqual([
      {
        path: '/v1/payments',
        body: payment,
        schema: salesPaymentSchema,
        options: { idempotencyKey: 'key-1' },
      },
    ]);
  });
});

describe('SampleSalesPaymentService (marked sample data until invoice reads exist)', () => {
  it('answers a posted payment shaped like the API, with a receipt number', async () => {
    const answer = await new SampleSalesPaymentService().recordPayment(payment, 'key-1');
    expect(salesPaymentSchema.safeParse(answer).success).toBe(true);
    expect(answer).toMatchObject({ partyId: PARTY, invoiceId: INVOICE, amount: '1500.00', status: 'posted' });
  });

  it('replays the first answer for the same key, like the API; a new key is a new receipt', async () => {
    const sample = new SampleSalesPaymentService();
    const first = await sample.recordPayment(payment, 'key-1');
    expect(await sample.recordPayment(payment, 'key-1')).toEqual(first);
    const second = await sample.recordPayment(payment, 'key-2');
    expect(second.receiptNumber).not.toBe(first.receiptNumber);
  });
});
