import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { ISalesQuery } from './contracts/ISalesQuery.js';
import type {
  IInvoiceReadQuery,
  InvoiceDetailRecord,
  InvoiceListFilter,
  InvoiceSummaryRecord,
} from './contracts/IInvoiceReadQuery.js';
import { SalesManager, type SalesManagerServices } from './SalesManager.js';

/**
 * F4, the invoice reads (ADR 0059 section 2), over a fake read query: the payment status, newest-first paging with an
 * id cursor, and the 404s. The real reads are invoices.read.isolation.test.ts. Every value is invented.
 */
const id = (n: number) => `0196f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const summary = (n: number, total: string, paid: string, due: string): InvoiceSummaryRecord => ({
  id: id(n),
  number: `INV-${String(n).padStart(6, '0')}`,
  branchId: id(900),
  partyId: id(800),
  invoiceDate: '2026-11-20',
  issuedAt: new Date('2026-11-20T05:00:00Z'),
  customerName: 'Shirin Akter',
  total,
  paid,
  due,
  status: 'posted',
});

class FakeReads implements IInvoiceReadQuery {
  filters: InvoiceListFilter[] = [];
  constructor(
    private readonly rows: InvoiceSummaryRecord[],
    private readonly detail: InvoiceDetailRecord | null = null,
  ) {}
  async listInvoices(filter: InvoiceListFilter): Promise<InvoiceSummaryRecord[]> {
    this.filters.push(filter);
    return this.rows.slice(0, filter.limit);
  }
  async findInvoice(): Promise<InvoiceDetailRecord | null> {
    return this.detail;
  }
}

const unused = () => Promise.reject(new Error('not used by the reads'));
function managerWith(reads: IInvoiceReadQuery): SalesManager {
  const services = {
    stock: {},
    posting: {},
    numbers: {},
    payments: {},
    clock: { now: () => new Date('2026-11-25T00:00:00Z') },
    invoiceReads: reads,
  } as unknown as SalesManagerServices;
  return new SalesManager({ productsForSale: unused } as unknown as ISalesQuery, services);
}

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: unknown) => (e instanceof AppError ? { code: e.code, fields: e.fields.map((f) => f.code) } : e),
  );

describe('listInvoices (ADR 0059 section 2)', () => {
  it('names the payment status from paid and due, and the time as ISO', async () => {
    const reads = new FakeReads([
      summary(3, '1000.00', '1000.00', '0.00'),
      summary(2, '2000.00', '400.00', '1600.00'),
      summary(1, '1500.00', '0.00', '1500.00'),
    ]);
    const page = await managerWith(reads).listInvoices({ limit: 25 });
    expect(page.items.map((i) => [i.number, i.paymentStatus])).toEqual([
      ['INV-000003', 'paid'],
      ['INV-000002', 'partly_paid'],
      ['INV-000001', 'due'],
    ]);
    expect(page.items[0]?.issuedAt).toBe('2026-11-20T05:00:00.000Z');
    expect(page.nextCursor).toBeNull();
  });

  it('asks one row more than the page; the last row shown is the next cursor', async () => {
    const reads = new FakeReads([
      summary(5, '1.00', '0.00', '1.00'),
      summary(4, '1.00', '0.00', '1.00'),
      summary(3, '1.00', '0.00', '1.00'),
    ]);
    const page = await managerWith(reads).listInvoices({ limit: 2, partyId: id(800) });
    expect(reads.filters[0]).toEqual({
      limit: 3,
      partyId: id(800),
      branchId: undefined,
      beforeId: undefined,
    });
    expect(page.items.map((i) => i.id)).toEqual([id(5), id(4)]);
    expect(page.nextCursor).toBe(id(4));
    await managerWith(reads).listInvoices({ limit: 2, cursor: id(4) });
    expect(reads.filters[1]?.beforeId).toBe(id(4));
  });

  it('a cursor that is not an invoice id is 400 page.cursor_invalid, and nothing is read', async () => {
    const reads = new FakeReads([]);
    expect(await errorOf(managerWith(reads).listInvoices({ limit: 2, cursor: 'abc' }))).toEqual({
      code: 'VALIDATION_FAILED',
      fields: ['page.cursor_invalid'],
    });
    expect(reads.filters).toEqual([]);
  });
});

describe('getInvoice (ADR 0059 section 2)', () => {
  it('an id not in the scope, or not an id, is 404 invoice.not_found', async () => {
    for (const asked of [id(7), 'nope']) {
      expect(await errorOf(managerWith(new FakeReads([])).getInvoice(asked))).toEqual({
        code: 'NOT_FOUND',
        fields: ['invoice.not_found'],
      });
    }
  });

  it('returns the lines and payments with ISO times', async () => {
    const detail: InvoiceDetailRecord = {
      ...summary(9, '3000.00', '400.00', '2600.00'),
      soldBy: 'Sample Cashier',
      subtotal: '3000.00',
      discount: '0.00',
      lines: [
        { description: 'Clutch cable, 150 cc', quantity: '3.000', unitPrice: '1000.00', amount: '3000.00' },
      ],
      payments: [
        {
          receivedAt: new Date('2026-11-21T06:00:00Z'),
          receiptNumber: 'RC-SHW-000004',
          method: 'cash',
          amount: '400.00',
          externalRef: null,
        },
      ],
    };
    const got = await managerWith(new FakeReads([], detail)).getInvoice(id(9));
    expect(got).toMatchObject({
      number: 'INV-000009',
      paymentStatus: 'partly_paid',
      soldBy: 'Sample Cashier',
    });
    expect(got.payments[0]?.receivedAt).toBe('2026-11-21T06:00:00.000Z');
  });
});
