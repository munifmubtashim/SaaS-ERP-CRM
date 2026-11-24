import {
  AppError,
  formatMoney,
  parseMoney,
  subtractMoney,
  sumMoney,
  type PostInvoiceInput,
} from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IClock } from './contracts/IClock.js';
import type {
  ISalesQuery,
  NewInvoice,
  NewInvoiceLine,
  PartyForSale,
  ProductForSale,
  UnitForSale,
} from './contracts/ISalesQuery.js';
import type { ISalesPaymentQuery, NewSalesPayment } from './contracts/ISalesPaymentQuery.js';
import type { IStockService, StockMovementDraft } from './contracts/provided/IStockService.js';
import { BankPayment, BkashPayment, CardPayment, CashPayment } from './paymentMethods.js';
import { SalesManager } from './SalesManager.js';
import { SalesPaymentRecorder } from './SalesPaymentRecorder.js';
import { FakeNumberSeries } from './test/FakeNumberSeries.js';
import { FakePostingService } from './test/FakePostingService.js';

/**
 * ADR 0022 tests 1 to 3 with the ADR 0012 fakes, plus Munif's 24 Nov rules: payments at the sale go through ADR 0016's
 * recorder (one journal and one receipt number each); a sale leaving a due must name a real customer, never the
 * walk-in party; numbers are taken in ADR 0015's order (invoice, receipts, then journals); the answer never carries
 * a cost; no VAT line while VAT is off. Real Postgres and the route are 3b-2.
 */
const BRANCH = '01937000-0000-7000-8000-0000000000e0';
const USER = '01937000-0000-7000-8000-0000000000b1';
const CUSTOMER = '01937000-0000-7000-8000-0000000000c1';
const WALK_IN = '01937000-0000-7000-8000-0000000000c0';
const PAD = '01937000-0000-7000-8000-0000000000f0';
const OIL = '01937000-0000-7000-8000-0000000000f1';
const BIKE = '01937000-0000-7000-8000-0000000000f2';
const OLD = '01937000-0000-7000-8000-0000000000f3';
const UNIT = '01937000-0000-7000-8000-0000000000a9';
const OTHER_UNIT = '01937000-0000-7000-8000-0000000000a8';
const INVOICE_ID = '01937000-0000-7000-8000-0000000000d9';
/** 19:30 UTC on 23 Nov is 01:30 on 24 Nov in Dhaka. */
const clock: IClock = { now: () => new Date('2026-11-23T19:30:00Z') };

class FakeSalesQuery implements ISalesQuery {
  invoices: NewInvoice[] = [];
  lines: NewInvoiceLine[] = [];
  sold: string[] = [];
  readonly products: ProductForSale[] = [
    { id: PAD, tracking: 'quantity', status: 'active', sellPrice: '1000.00' },
    { id: OIL, tracking: 'quantity', status: 'active', sellPrice: '450.00' },
    { id: BIKE, tracking: 'serial', status: 'active', sellPrice: '185000.00' },
    { id: OLD, tracking: 'quantity', status: 'archived', sellPrice: '10.00' },
  ];
  readonly units: UnitForSale[] = [
    { id: UNIT, productId: BIKE, branchId: BRANCH, status: 'in_stock' },
    { id: OTHER_UNIT, productId: PAD, branchId: BRANCH, status: 'in_stock' },
  ];
  readonly parties: PartyForSale[] = [
    { id: CUSTOMER, isWalkIn: false, isCustomer: true, status: 'active' },
    { id: WALK_IN, isWalkIn: true, isCustomer: true, status: 'active' },
  ];
  async productsForSale(ids: readonly string[]) {
    return this.products.filter((p) => ids.includes(p.id));
  }
  async unitsForSale(ids: readonly string[]) {
    return this.units.filter((u) => ids.includes(u.id));
  }
  async partyForSale(id: string) {
    return this.parties.find((p) => p.id === id) ?? null;
  }
  async newInvoiceId() {
    return INVOICE_ID;
  }
  async insertInvoice(row: NewInvoice) {
    this.invoices.push(row);
  }
  async insertInvoiceLines(lines: NewInvoiceLine[]) {
    this.lines.push(...lines);
  }
  async markUnitsSold(unitIds: readonly string[]) {
    this.sold.push(...unitIds);
    return unitIds.length;
  }
}

class FakePaymentQuery implements ISalesPaymentQuery {
  inserted: NewSalesPayment[] = [];
  constructor(private readonly sales: FakeSalesQuery) {}
  private seq = 0;
  async newPaymentId() {
    this.seq += 1;
    return `01937000-0000-7000-8000-00000000010${this.seq}`;
  }
  async invoiceDueForUpdate(invoiceId: string, partyId: string) {
    const invoice = this.sales.invoices.find((i) => i.id === invoiceId && i.partyId === partyId);
    if (!invoice) return null;
    const paid = sumMoney(this.inserted.map((p) => parseMoney(p.amount)));
    return formatMoney(subtractMoney(parseMoney(invoice.total), paid));
  }
  async insertPayment(payment: NewSalesPayment) {
    this.inserted.push(payment);
  }
}

/** Stock that answers with chosen costs: ৳700.00 a brake pad set, ৳300.00 a bottle of oil, ৳150,000.00 the bike. */
class CostingStock implements IStockService {
  drafts: StockMovementDraft[] = [];
  failWith: AppError | null = null;
  private readonly cost: Record<string, string> = { [PAD]: '700.00', [OIL]: '300.00', [BIKE]: '150000.00' };
  async move(movements: StockMovementDraft[]) {
    if (this.failWith) throw this.failWith;
    this.drafts.push(...movements);
    return {
      movementIds: movements.map((_, i) => `m-${this.drafts.length + i}`),
      costs: movements.map((m) => this.cost[m.productId] ?? '0.00'),
    };
  }
}

function setup() {
  const sales = new FakeSalesQuery();
  const paymentQuery = new FakePaymentQuery(sales);
  const posting = new FakePostingService();
  const numbers = new FakeNumberSeries('N-');
  const stock = new CostingStock();
  const payments = new SalesPaymentRecorder(paymentQuery, posting, numbers, clock, [
    new CashPayment(),
    new BankPayment(),
    new BkashPayment(),
    new CardPayment(),
  ]);
  const manager = new SalesManager(sales, { stock, posting, numbers, payments, clock });
  return { manager, sales, paymentQuery, posting, numbers, stock };
}

const sale = (fields: Partial<PostInvoiceInput> = {}): PostInvoiceInput => ({
  partyId: CUSTOMER,
  customerName: 'Rahim Uddin',
  lines: [{ productId: PAD, serialUnitId: null, qty: '2' }],
  discount: '0.00',
  payments: [{ method: 'cash', amount: '2000.00', externalRef: null }],
  ...fields,
});

const where = { branchId: BRANCH, userId: USER };

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, field: (error as AppError).fields[0]?.code };
}

describe('ADR 0022 test 1: one sale, its stock moves, its journals', () => {
  it('a parts sale paid in cash: Dr receivable / Cr revenue, Dr cost of goods / Cr inventory, then the payment', async () => {
    const { manager, posting, stock, sales } = setup();
    const posted = await manager.postInvoice(sale(), where);

    expect(stock.drafts).toEqual([
      {
        productId: PAD,
        branchId: BRANCH,
        qtyDelta: '-2.000',
        kind: 'sale',
        source: { type: 'sales_invoice', id: INVOICE_ID },
      },
    ]);
    const [saleJournal, paymentJournal] = posting.journals;
    expect(saleJournal?.draft?.source).toEqual({ type: 'sales_invoice', id: INVOICE_ID });
    expect(saleJournal?.draft?.date).toBe('2026-11-24');
    expect(saleJournal?.draft?.lines).toEqual([
      { role: 'receivable', debit: '2000.00', credit: '0.00', partyId: CUSTOMER },
      { role: 'sales_revenue', debit: '0.00', credit: '2000.00' },
      { role: 'cost_of_goods_sold', debit: '1400.00', credit: '0.00' },
      { role: 'inventory', debit: '0.00', credit: '1400.00' },
    ]);
    expect(paymentJournal?.draft?.lines).toEqual([
      { role: 'cash', debit: '2000.00', credit: '0.00' },
      { role: 'receivable', debit: '0.00', credit: '2000.00', partyId: CUSTOMER },
    ]);
    expect(sales.invoices[0]).toMatchObject({
      id: INVOICE_ID,
      journalId: saleJournal?.journalId,
      subtotal: '2000.00',
      total: '2000.00',
      soldBy: USER,
      invoiceDate: '2026-11-24',
    });
    expect(sales.lines).toEqual([
      expect.objectContaining({
        lineNo: 1,
        unitPrice: '1000.00',
        lineTotal: '2000.00',
        costAmount: '1400.00',
      }),
    ]);
    expect(posted).toMatchObject({ total: '2000.00', paid: '2000.00', due: '0.00', status: 'posted' });
  });

  it('the answer never carries a cost (a hidden field, plan 2.5)', async () => {
    const { manager } = setup();
    expect(JSON.stringify(await manager.postInvoice(sale(), where))).not.toMatch(/cost/i);
  });

  it('a bike and a part: the bike leaves by its unit at its own cost, the unit is marked sold', async () => {
    const { manager, posting, sales, stock } = setup();
    await manager.postInvoice(
      sale({
        lines: [
          { productId: BIKE, serialUnitId: UNIT, qty: '1' },
          { productId: OIL, serialUnitId: null, qty: '1.5' },
        ],
        payments: [],
      }),
      where,
    );
    expect(stock.drafts.map((d) => [d.productId, d.qtyDelta, d.unitId])).toEqual([
      [BIKE, '-1.000', UNIT],
      [OIL, '-1.500', undefined],
    ]);
    expect(posting.journals[0]?.draft?.lines.slice(2)).toEqual([
      { role: 'cost_of_goods_sold', debit: '150450.00', credit: '0.00' },
      { role: 'inventory', debit: '0.00', credit: '150450.00' },
    ]);
    expect(sales.sold).toEqual([UNIT]);
  });

  it('a discount is posted net (ADR 0022 open question 1): revenue is the total after discount', async () => {
    const { manager, posting } = setup();
    const posted = await manager.postInvoice(sale({ discount: '100.00', payments: [] }), where);
    expect(posted).toMatchObject({
      subtotal: '2000.00',
      discount: '100.00',
      total: '1900.00',
      due: '1900.00',
    });
    expect(posting.journals[0]?.draft?.lines[1]).toEqual({
      role: 'sales_revenue',
      debit: '0.00',
      credit: '1900.00',
    });
  });

  it('no VAT line while VAT is off (decision 6; no rate is hard-coded)', async () => {
    const { manager, posting } = setup();
    await manager.postInvoice(sale(), where);
    expect(posting.journals[0]?.draft?.lines.map((l) => l.role)).not.toContain('vat_output_payable');
  });
});

describe('payments at the sale (ADR 0022 step 7, ADR 0016), and the due', () => {
  it('part cash, part bKash leaves a due on a named customer: one journal and one receipt number per payment', async () => {
    const { manager, posting, paymentQuery } = setup();
    const posted = await manager.postInvoice(
      sale({
        lines: [{ productId: PAD, serialUnitId: null, qty: '3' }],
        payments: [
          { method: 'cash', amount: '1000.00', externalRef: null },
          { method: 'bkash', amount: '700.00', externalRef: 'TX8K2M4' },
        ],
      }),
      where,
    );
    expect(posted).toMatchObject({ total: '3000.00', paid: '1700.00', due: '1300.00' });
    expect(posted.payments.map((p) => [p.method, p.amount, p.receiptNumber])).toEqual([
      ['cash', '1000.00', 'N-000001'],
      ['bkash', '700.00', 'N-000002'],
    ]);
    expect(posting.journals).toHaveLength(3);
    expect(posting.journals[2]?.draft?.lines[0]).toEqual({
      role: 'mobile_money',
      debit: '700.00',
      credit: '0.00',
    });
    expect(paymentQuery.inserted.map((p) => p.externalRef)).toEqual([null, 'TX8K2M4']);
  });

  it('numbers are taken in ADR 0015 order: the invoice, then every receipt, before any journal', async () => {
    const { manager, numbers } = setup();
    await manager.postInvoice(
      sale({
        payments: [
          { method: 'cash', amount: '500.00', externalRef: null },
          { method: 'bkash', amount: '500.00', externalRef: 'TX1' },
        ],
      }),
      where,
    );
    expect(numbers.taken.map((t) => t.kind)).toEqual(['invoice', 'receipt', 'receipt']);
  });

  it('a sale leaving a due must name a real customer, not the walk-in party (Munif, 24 Nov)', async () => {
    const { manager, numbers, stock, posting } = setup();
    expect(
      await refusal(manager.postInvoice(sale({ partyId: WALK_IN, customerName: null, payments: [] }), where)),
    ).toEqual({ code: 'CONFLICT', field: 'invoice.due_needs_customer' });
    expect([numbers.taken, stock.drafts, posting.journals]).toEqual([[], [], []]);
  });

  it('a walk-in sale paid in full is fine', async () => {
    const { manager } = setup();
    await expect(
      manager.postInvoice(sale({ partyId: WALK_IN, customerName: null }), where),
    ).resolves.toMatchObject({
      due: '0.00',
    });
  });
});

describe('ADR 0022 test 2: refused before any number, stock move or journal', () => {
  it.each([
    [
      'an archived product',
      { lines: [{ productId: OLD, serialUnitId: null, qty: '1' }] },
      'invoice.product_unavailable',
    ],
    [
      'an unknown product',
      { lines: [{ productId: '01937000-0000-7000-8000-0000000000ff', serialUnitId: null, qty: '1' }] },
      'invoice.product_unavailable',
    ],
    [
      'a serial product without its unit',
      { lines: [{ productId: BIKE, serialUnitId: null, qty: '1' }] },
      'invoice.unit_required',
    ],
    [
      'a unit on a counted product',
      { lines: [{ productId: PAD, serialUnitId: OTHER_UNIT, qty: '1' }] },
      'invoice.unit_not_serial',
    ],
    [
      'a unit of another product',
      { lines: [{ productId: BIKE, serialUnitId: OTHER_UNIT, qty: '1' }] },
      'unit.not_available',
    ],
    [
      'the same unit twice',
      {
        lines: [
          { productId: BIKE, serialUnitId: UNIT, qty: '1' },
          { productId: BIKE, serialUnitId: UNIT, qty: '1' },
        ],
      },
      'invoice.unit_repeated',
    ],
    [
      'a discount above the subtotal',
      { discount: '2000.01', payments: [] },
      'invoice.discount_above_subtotal',
    ],
    ['a total of zero', { discount: '2000.00', payments: [] }, 'invoice.total_zero'],
    [
      'payments above the total',
      { payments: [{ method: 'cash', amount: '2000.01', externalRef: null }] },
      'invoice.paid_above_total',
    ],
    ['an unknown customer', { partyId: '01937000-0000-7000-8000-0000000000cf' }, 'invoice.party_unknown'],
  ])('%s', async (_case, change, field) => {
    const { manager, numbers, stock, posting, sales } = setup();
    expect((await refusal(manager.postInvoice(sale(change as Partial<PostInvoiceInput>), where))).field).toBe(
      field,
    );
    expect([numbers.taken, stock.drafts, posting.journals, sales.invoices]).toEqual([[], [], [], []]);
  });
});

describe('ADR 0022 test 3: a failed step leaves no invoice', () => {
  it('if the stock move throws (not enough stock), no journal is posted and no invoice inserted', async () => {
    const { manager, stock, posting, sales } = setup();
    stock.failWith = new AppError('CONFLICT', 'Not enough stock.', [
      { path: 'qtyDelta', code: 'stock.insufficient', message: 'Not enough stock.' },
    ]);
    expect((await refusal(manager.postInvoice(sale(), where))).field).toBe('stock.insufficient');
    expect([posting.journals, sales.invoices]).toEqual([[], []]);
  });

  it('if posting throws (an unmapped role), no invoice is inserted', async () => {
    const { manager, posting, sales } = setup();
    posting.failNextWith = new AppError('CONFLICT', 'No account.', [
      { path: 'journal', code: 'journal.role_unmapped', message: 'No account.' },
    ]);
    expect((await refusal(manager.postInvoice(sale(), where))).field).toBe('journal.role_unmapped');
    expect(sales.invoices).toEqual([]);
  });
});
