import {
  AppError,
  businessDateInDhaka,
  compareMoney,
  formatMoney,
  isZero,
  multiplyByQuantity,
  parseMoney,
  subtractMoney,
  sumMoney,
  ZERO,
  type InvoiceDetail,
  type InvoiceListQuery,
  type InvoiceListResponse,
  type InvoicePaymentStatus,
  type InvoiceSummary,
  type Paisa,
  type RecordPayment,
  type SalesPayment,
  type PostedInvoice,
  type PostInvoiceInput,
} from '@erp/shared';
import type { IClock } from './contracts/IClock.js';
import type {
  IInvoiceReadQuery,
  InvoiceDetailRecord,
  InvoiceSummaryRecord,
} from './contracts/IInvoiceReadQuery.js';
import type { ISalesPaymentRecorder } from './contracts/ISalesPaymentRecorder.js';
import type { ISalesQuery, PartyForSale, ProductForSale } from './contracts/ISalesQuery.js';
import type { INumberSeries } from './contracts/provided/INumberSeries.js';
import type { IPostingService, JournalLineDraft } from './contracts/provided/IPostingService.js';
import type { IStockService } from './contracts/provided/IStockService.js';

/** Where and by whom: the request's branch (X-Branch-Id) and the signed-in user, never from the body. */
export interface SaleContext {
  branchId: string;
  userId: string;
}

export interface SalesManagerServices {
  stock: IStockService;
  posting: IPostingService;
  numbers: INumberSeries;
  payments: ISalesPaymentRecorder;
  clock: IClock;
  /** F4, the invoice reads (ADR 0059 section 2). */
  invoiceReads: IInvoiceReadQuery;
}

interface CheckedLine {
  productId: string;
  serialUnitId: string | null;
  qty: string;
  unitPrice: Paisa;
  lineTotal: Paisa;
  /** A pass-through fee (item 3d): no stock, no cost, credited to pass_through_payable. */
  isPassThrough: boolean;
}

/** A quantity string with exactly 3 decimals, as the stock ledger stores it ("2" → "2.000"). */
function threeDecimals(qty: string): string {
  const [whole = '0', decimals = ''] = qty.split('.');
  return `${whole}.${decimals.padEnd(3, '0')}`;
}

function refuse(
  code: 'VALIDATION_FAILED' | 'CONFLICT' | 'NOT_FOUND',
  path: string,
  field: string,
  message: string,
) {
  return new AppError(code, message, [{ path, code: field, message }]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How much of a sale is paid (ADR 0059 section 2): nothing yet, some of it, or all of it. */
function paymentStatusOf(paid: string, due: string): InvoicePaymentStatus {
  if (compareMoney(parseMoney(due), ZERO) <= 0) return 'paid';
  return isZero(parseMoney(paid)) ? 'due' : 'partly_paid';
}

function toSummary(row: InvoiceSummaryRecord): InvoiceSummary {
  return {
    id: row.id,
    number: row.number,
    branchId: row.branchId,
    partyId: row.partyId,
    invoiceDate: row.invoiceDate,
    issuedAt: row.issuedAt.toISOString(),
    customerName: row.customerName,
    total: row.total,
    paid: row.paid,
    due: row.due,
    status: row.status,
    paymentStatus: paymentStatusOf(row.paid, row.due),
  };
}

function toDetail(row: InvoiceDetailRecord): InvoiceDetail {
  return {
    ...toSummary(row),
    soldBy: row.soldBy,
    subtotal: row.subtotal,
    discount: row.discount,
    lines: row.lines.map((line) => ({ ...line })),
    payments: row.payments.map((payment) => ({ ...payment, receivedAt: payment.receivedAt.toISOString() })),
  };
}

/**
 * Sales module: business rules. No Express, no SQL. Owner: Farhan; posting a sale built by Munif for item 3b.
 *
 * `postInvoice` is ADR 0022 section 2, in the request's one transaction: check everything, take the invoice number
 * and every receipt number (ADR 0015 order: documents before journals), move the stock, post the sale's journal,
 * insert the invoice with its journal id (invariant 4), then record each payment through ADR 0016's recorder (one
 * journal and one receipt each). Any refusal throws and the whole request rolls back, numbers included.
 */
export class SalesManager {
  constructor(
    protected readonly query: ISalesQuery,
    private readonly services: SalesManagerServices,
  ) {}

  async postInvoice(input: PostInvoiceInput, where: SaleContext): Promise<PostedInvoice> {
    const lines = await this.checkLines(input, where.branchId);
    const subtotal = sumMoney(lines.map((line) => line.lineTotal));
    // A discount comes off the goods only: pass-through money is owed in full to someone else (invariant 8).
    const goods = sumMoney(lines.filter((line) => !line.isPassThrough).map((line) => line.lineTotal));
    const fees = subtractMoney(subtotal, goods);
    const discount = parseMoney(input.discount);
    if (compareMoney(discount, goods) > 0) {
      throw refuse(
        'VALIDATION_FAILED',
        'discount',
        'invoice.discount_above_subtotal',
        'The discount is more than the goods on this sale.',
      );
    }
    const revenue = subtractMoney(goods, discount);
    const total = subtractMoney(subtotal, discount);
    if (isZero(total))
      throw refuse('VALIDATION_FAILED', 'discount', 'invoice.total_zero', 'The invoice total is zero.');
    const paid = sumMoney(input.payments.map((payment) => parseMoney(payment.amount)));
    if (compareMoney(paid, total) > 0) {
      throw refuse(
        'CONFLICT',
        'payments',
        'invoice.paid_above_total',
        'The payments are more than the invoice total.',
      );
    }
    const party = await this.checkParty(input.partyId);
    if (party.isWalkIn && compareMoney(paid, total) < 0) {
      throw refuse(
        'CONFLICT',
        'partyId',
        'invoice.due_needs_customer',
        'A sale that leaves a due must name the customer, not the walk-in customer.',
      );
    }

    const { stock, posting, numbers, payments, clock } = this.services;
    const date = businessDateInDhaka(clock.now());
    const number = await numbers.next('invoice', where.branchId);
    const receiptNumbers: string[] = [];
    for (const _payment of input.payments) receiptNumbers.push(await numbers.next('receipt', where.branchId));
    const invoiceId = await this.query.newInvoiceId();

    const source = { type: 'sales_invoice', id: invoiceId };
    // Only goods move stock; a pass-through fee never does and carries no cost.
    const stocked = lines.filter((line) => !line.isPassThrough);
    const { costs } =
      stocked.length > 0
        ? await stock.move(
            stocked.map((line) => ({
              productId: line.productId,
              branchId: where.branchId,
              qtyDelta: `-${line.qty}`,
              ...(line.serialUnitId ? { unitId: line.serialUnitId } : {}),
              kind: 'sale' as const,
              source,
            })),
          )
        : { costs: [] };
    let next = 0;
    const lineCosts = lines.map((line) =>
      line.isPassThrough ? ZERO : multiplyByQuantity(parseMoney(costs[next++] ?? '0.00'), line.qty),
    );
    const cost = sumMoney(lineCosts);

    const journalLines: JournalLineDraft[] = [
      { role: 'receivable', debit: formatMoney(total), credit: '0.00', partyId: party.id },
    ];
    if (compareMoney(revenue, ZERO) > 0) {
      journalLines.push({ role: 'sales_revenue', debit: '0.00', credit: formatMoney(revenue) });
    }
    if (compareMoney(fees, ZERO) > 0) {
      // Invariant 8 (ledger packet 4.4): pass-through money is a liability, never revenue.
      journalLines.push({ role: 'pass_through_payable', debit: '0.00', credit: formatMoney(fees) });
    }
    if (compareMoney(cost, ZERO) > 0) {
      journalLines.push(
        { role: 'cost_of_goods_sold', debit: formatMoney(cost), credit: '0.00' },
        { role: 'inventory', debit: '0.00', credit: formatMoney(cost) },
      );
    }
    const { journalId } = await posting.post({
      branchId: where.branchId,
      date,
      source,
      memo: `Invoice ${number}`,
      lines: journalLines,
    });

    await this.query.insertInvoice({
      id: invoiceId,
      branchId: where.branchId,
      number,
      partyId: party.id,
      customerName: input.customerName,
      invoiceDate: date,
      subtotal: formatMoney(subtotal),
      discount: formatMoney(discount),
      total: formatMoney(total),
      journalId,
      soldBy: where.userId,
    });
    await this.query.insertInvoiceLines(
      lines.map((line, i) => ({
        invoiceId,
        lineNo: i + 1,
        productId: line.productId,
        serialUnitId: line.serialUnitId,
        qty: line.qty,
        unitPrice: formatMoney(line.unitPrice),
        lineTotal: formatMoney(line.lineTotal),
        costAmount: formatMoney(lineCosts[i] ?? ZERO),
        isPassThrough: line.isPassThrough,
      })),
    );
    const units = lines.flatMap((line) => (line.serialUnitId ? [line.serialUnitId] : []));
    if (units.length > 0 && (await this.query.markUnitsSold(units, invoiceId)) !== units.length) {
      throw refuse('CONFLICT', 'lines', 'unit.not_available', 'A unit on this sale is no longer in stock.');
    }

    const recorded: PostedInvoice['payments'] = [];
    for (const [i, payment] of input.payments.entries()) {
      const done = await payments.record({
        branchId: where.branchId,
        partyId: party.id,
        invoiceId,
        method: payment.method,
        amount: payment.amount,
        externalRef: payment.externalRef,
        receiptNumber: receiptNumbers[i] as string,
        createdBy: where.userId,
      });
      recorded.push({
        id: done.paymentId,
        receiptNumber: done.receiptNumber,
        method: payment.method,
        amount: payment.amount,
        externalRef: payment.externalRef?.trim() || null,
      });
    }

    return {
      id: invoiceId,
      number,
      invoiceDate: date,
      partyId: party.id,
      customerName: input.customerName,
      subtotal: formatMoney(subtotal),
      discount: formatMoney(discount),
      total: formatMoney(total),
      paid: formatMoney(paid),
      due: formatMoney(subtractMoney(total, paid)),
      status: 'posted',
      lines: lines.map((line, i) => ({
        lineNo: i + 1,
        productId: line.productId,
        serialUnitId: line.serialUnitId,
        qty: line.qty,
        unitPrice: formatMoney(line.unitPrice),
        lineTotal: formatMoney(line.lineTotal),
      })),
      payments: recorded,
    };
  }

  /** Every product sellable, every serial product with its own unit at this branch, each unit once (ADR 0020). */
  private async checkLines(input: PostInvoiceInput, branchId: string): Promise<CheckedLine[]> {
    const products = new Map<string, ProductForSale>(
      (await this.query.productsForSale([...new Set(input.lines.map((l) => l.productId))])).map((p) => [
        p.id,
        p,
      ]),
    );
    const unitIds = input.lines.flatMap((l) => (l.serialUnitId ? [l.serialUnitId] : []));
    if (new Set(unitIds).size !== unitIds.length) {
      throw refuse(
        'VALIDATION_FAILED',
        'lines',
        'invoice.unit_repeated',
        'The same unit is on the sale twice.',
      );
    }
    const units = new Map((await this.query.unitsForSale(unitIds)).map((u) => [u.id, u]));
    return input.lines.map((line, i) => {
      const path = `lines.${i}`;
      const product = products.get(line.productId);
      if (!product || product.status !== 'active') {
        throw refuse(
          'CONFLICT',
          `${path}.productId`,
          'invoice.product_unavailable',
          'This product can no longer be sold.',
        );
      }
      if (product.vatOnFee) {
        // Decision 6: VAT on a fee is a setting, off by default. No rate is hard-coded, and the tax-rate setup (plan
        // Q15) doesn't exist yet, so a fee with VAT switched on can't be posted.
        throw refuse(
          'CONFLICT',
          `${path}.productId`,
          'invoice.vat_not_set_up',
          'VAT on this fee is switched on, but VAT is not set up yet.',
        );
      }
      if (product.tracking === 'serial' && !line.serialUnitId) {
        throw refuse(
          'VALIDATION_FAILED',
          `${path}.serialUnitId`,
          'invoice.unit_required',
          'Choose the unit sold.',
        );
      }
      if (product.tracking !== 'serial' && line.serialUnitId) {
        throw refuse(
          'VALIDATION_FAILED',
          `${path}.serialUnitId`,
          'invoice.unit_not_serial',
          'This product has no units.',
        );
      }
      if (line.serialUnitId) {
        const unit = units.get(line.serialUnitId);
        if (
          !unit ||
          unit.productId !== line.productId ||
          unit.branchId !== branchId ||
          unit.status !== 'in_stock'
        ) {
          throw refuse(
            'CONFLICT',
            `${path}.serialUnitId`,
            'unit.not_available',
            'This unit is not in stock here.',
          );
        }
      }
      const qty = threeDecimals(line.qty);
      const unitPrice = parseMoney(product.sellPrice);
      return {
        productId: line.productId,
        serialUnitId: line.serialUnitId,
        qty,
        unitPrice,
        lineTotal: multiplyByQuantity(unitPrice, qty),
        isPassThrough: product.isPassThrough,
      };
    });
  }

  /**
   * POST /v1/payments (ADR 0057 section 3): a customer's payment on one of their invoices, or an advance. The party
   * must be a visible, active customer, and an advance can't name the walk-in customer. ADR 0016's recorder then checks
   * the due with the invoice row locked, takes the branch's receipt number, posts the journal and inserts the payment,
   * all in the request's one transaction.
   */
  /**
   * GET /v1/invoices (ADR 0059 section 2): the scope's invoices, newest first. The cursor is the last invoice shown
   * (ids are uuid v7); one extra row says whether another page exists.
   */
  async listInvoices(query: InvoiceListQuery): Promise<InvoiceListResponse> {
    if (query.cursor !== undefined && !UUID.test(query.cursor)) {
      throw refuse(
        'VALIDATION_FAILED',
        'cursor',
        'page.cursor_invalid',
        'Start the list again from the first page.',
      );
    }
    const rows = await this.services.invoiceReads.listInvoices({
      limit: query.limit + 1,
      partyId: query.partyId,
      branchId: query.branchId,
      beforeId: query.cursor,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toSummary),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** GET /v1/invoices/:id: one invoice with its lines and payments; 404 when it isn't in the scope. */
  async getInvoice(id: string): Promise<InvoiceDetail> {
    const row = UUID.test(id) ? await this.services.invoiceReads.findInvoice(id) : null;
    if (!row) throw refuse('NOT_FOUND', 'id', 'invoice.not_found', 'Invoice not found.');
    return toDetail(row);
  }

  async recordPayment(input: RecordPayment, where: SaleContext): Promise<SalesPayment> {
    const party = await this.query.partyForSale(input.partyId);
    if (!party || !party.isCustomer || party.status !== 'active') {
      throw refuse('NOT_FOUND', 'partyId', 'payment.party_unknown', 'Customer not found.');
    }
    if (input.invoiceId === null && party.isWalkIn) {
      throw refuse(
        'CONFLICT',
        'partyId',
        'payment.walk_in_advance',
        'An advance must name the customer, not the walk-in customer.',
      );
    }
    const done = await this.services.payments.record({
      branchId: where.branchId,
      partyId: party.id,
      invoiceId: input.invoiceId,
      method: input.method,
      amount: input.amount,
      externalRef: input.externalRef,
      note: input.note,
      createdBy: where.userId,
    });
    return {
      id: done.paymentId,
      receiptNumber: done.receiptNumber,
      partyId: party.id,
      invoiceId: input.invoiceId,
      branchId: where.branchId,
      method: input.method,
      externalRef: input.externalRef,
      amount: input.amount,
      status: 'posted',
      receivedAt: done.receivedAt,
      note: input.note,
    };
  }

  private async checkParty(partyId: string): Promise<PartyForSale> {
    const party = await this.query.partyForSale(partyId);
    if (!party || !party.isCustomer || party.status !== 'active') {
      throw refuse('NOT_FOUND', 'partyId', 'invoice.party_unknown', 'Customer not found.');
    }
    return party;
  }
}
