import {
  customerDuesSchema,
  formatMoney,
  parseMoney,
  salesPaymentSchema,
  subtractMoney,
  sumMoney,
} from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { MockPartyService, SAMPLE_BUSINESS_IDS } from './MockPartyService';
import { MockSalesService } from './MockSalesService';

const A = SAMPLE_BUSINESS_IDS.demoMotors;
const B = SAMPLE_BUSINESS_IDS.sampleTraders;
const salesFor = (businessId: string) => new MockSalesService(() => businessId, 0);

async function customerIds(businessId: string): Promise<string[]> {
  const page = await new MockPartyService(() => businessId, 0).list({ role: 'customer', limit: 100 });
  return page.items.map((r) => r.id);
}

describe('MockSalesService.dues (stands in for GET /v1/parties/:id/dues until A15)', () => {
  it('answers in the shared dues shape for every customer of the active business', async () => {
    for (const id of await customerIds(A)) {
      expect(customerDuesSchema.safeParse(await salesFor(A).dues(id)).success).toBe(true);
    }
  });

  it('adds up: each due is total minus paid, and the total due is the sum of the dues', async () => {
    for (const id of await customerIds(A)) {
      const d = await salesFor(A).dues(id);
      for (const inv of d.openInvoices) {
        expect(inv.due).toBe(formatMoney(subtractMoney(parseMoney(inv.total), parseMoney(inv.paid))));
      }
      expect(d.totalDue).toBe(formatMoney(sumMoney(d.openInvoices.map((i) => parseMoney(i.due)))));
    }
  });

  it('includes customers who owe nothing, and one 9-digit amount, for the empty and long cases', async () => {
    const all = await Promise.all((await customerIds(A)).map((id) => salesFor(A).dues(id)));
    expect(all.some((d) => d.openInvoices.length === 0)).toBe(true);
    expect(all.some((d) => d.totalDue.split('.')[0]?.length === 9)).toBe(true);
  });

  it('answers 404 for a customer of another business', async () => {
    const [id] = await customerIds(A);
    await expect(salesFor(B).dues(id ?? '')).rejects.toMatchObject({ status: 404 });
  });
});

describe('MockSalesService.recordPayment (stands in for POST /v1/payments until A15)', () => {
  const payment = (partyId: string) => ({
    partyId,
    invoiceId: null,
    method: 'bkash' as const,
    amount: '12500.00',
    externalRef: 'TXN-0001',
    note: null,
  });

  it('answers in the shared payment shape, posted, with a receipt number from the "server"', async () => {
    const [id = ''] = await customerIds(A);
    const paid = await salesFor(A).recordPayment(payment(id), 'key-1');
    expect(salesPaymentSchema.safeParse(paid).success).toBe(true);
    expect(paid).toMatchObject({ partyId: id, amount: '12500.00', method: 'bkash', status: 'posted' });
    expect(paid.receiptNumber).toMatch(/^R-\d{6}$/);
  });

  it('returns the first result for a repeated Idempotency-Key, and a new receipt for a new key', async () => {
    const [id = ''] = await customerIds(A);
    const sales = salesFor(A);
    const first = await sales.recordPayment(payment(id), 'key-1');
    expect(await sales.recordPayment(payment(id), 'key-1')).toEqual(first);
    const second = await sales.recordPayment(payment(id), 'key-2');
    expect(second.id).not.toBe(first.id);
    expect(second.receiptNumber).not.toBe(first.receiptNumber);
  });

  it('answers 404 for a customer of another business', async () => {
    const [id = ''] = await customerIds(A);
    await expect(salesFor(B).recordPayment(payment(id), 'key-1')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses the same key with a different payment: 409, as ADR 0011 (#37) says the server will', async () => {
    const [id = ''] = await customerIds(A);
    const sales = salesFor(A);
    await sales.recordPayment(payment(id), 'key-1');
    await expect(sales.recordPayment({ ...payment(id), amount: '99999.00' }, 'key-1')).rejects.toMatchObject({
      status: 409,
      body: { code: 'CONFLICT', fields: [{ path: 'Idempotency-Key', code: 'idempotency.key_reused' }] },
    });
  });

  it("keeps keys per business: a key used in business A never returns A's payment in business B", async () => {
    let active: string = A;
    const sales = new MockSalesService(() => active, 0);
    const [idA = ''] = await customerIds(A);
    const [idB = ''] = await customerIds(B);
    const inA = await sales.recordPayment(payment(idA), 'key-1');

    active = B;
    // The same key and body in B: B does not know A's customer, so 404, not A's payment.
    await expect(sales.recordPayment(payment(idA), 'key-1')).rejects.toMatchObject({ status: 404 });
    // The same key for B's own customer is a new payment of B.
    const inB = await sales.recordPayment(payment(idB), 'key-1');
    expect(inB.id).not.toBe(inA.id);
    expect(inB.partyId).toBe(idB);
  });
});
