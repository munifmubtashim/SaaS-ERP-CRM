import { customerDuesSchema, formatMoney, parseMoney, subtractMoney, sumMoney } from '@erp/shared';
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
